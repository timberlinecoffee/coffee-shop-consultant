// TIM-1176: Section F — Excel/CSV upload + AI-parse endpoint.
// POST /api/workspaces/buildout/import
// Accepts multipart/form-data with field "file" (.xlsx or .csv).
// Returns parsed preview rows with AI-normalised column mapping
// and per-row station/category inference.

export const runtime = "nodejs";
export const maxDuration = 60;

import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ParsedRow = {
  _id: string;         // client-side key (rowNum string)
  name: string;
  section_name: string;
  vendor: string;      // brand
  model: string;
  supplier: string;    // vendor/distributor
  quantity: number;
  unit_cost_cents: number;
  notes: string;
  category: string;
  skip: boolean;
};

// ── ExcelJS helpers ───────────────────────────────────────────────────────────

type CellValue = string | number | null;

function cellToString(val: ExcelJS.CellValue): string {
  if (val == null) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number") return String(val);
  // RichText
  if (typeof val === "object" && "richText" in val) {
    return (val as ExcelJS.CellRichTextValue).richText.map((r: { text?: string }) => r.text ?? "").join("").trim();
  }
  // Date
  if (val instanceof Date) return val.toLocaleDateString();
  // Hyperlink
  if (typeof val === "object" && "text" in val) return String((val as { text: unknown }).text ?? "").trim();
  return String(val).trim();
}

function cellToNumber(val: ExcelJS.CellValue): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return val;
  const str = cellToString(val).replace(/[$,\s]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

// Detect which row index (0-based) is the header row.
// Headers are rows where most cells are non-numeric strings.
function detectHeaderRow(rows: CellValue[][]): number {
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const row = rows[i];
    const nonEmpty = row.filter((c) => c !== null && c !== "");
    if (nonEmpty.length < 2) continue;
    const stringCells = nonEmpty.filter((c) => typeof c === "string" && isNaN(Number(c)));
    if (stringCells.length / nonEmpty.length >= 0.5) return i;
  }
  return 0;
}

async function parseWorkbook(buffer: Buffer, filename: string): Promise<{ headers: string[]; dataRows: Record<string, CellValue>[] }> {
  const wb = new ExcelJS.Workbook();

  if (filename.endsWith(".csv")) {
    // Treat csv buffer as a stream
    const { Readable } = await import("stream");
    const stream = Readable.from(buffer.toString("utf-8"));
    await wb.csv.read(stream);
  } else {
    // TIM-1147 build unblock: Node 22 typings widen `Buffer` to
    // `Buffer<ArrayBufferLike>`, which exceljs's stricter `Buffer` parameter
    // refuses. Runtime types are identical — cast through unknown to
    // satisfy tsc without forcing every caller to convert.
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  }

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No worksheet found in file");

  // Collect all rows as arrays of CellValues
  const rawRows: CellValue[][] = [];
  ws.eachRow({ includeEmpty: false }, (row: ExcelJS.Row) => {
    const cells: CellValue[] = [];
    row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell) => {
      const raw = cell.value;
      if (raw == null) {
        cells.push(null);
        return;
      }
      // merged cells: value is on the master cell only; keep it
      const numVal = cellToNumber(raw);
      if (numVal !== null) {
        cells.push(numVal);
      } else {
        const s = cellToString(raw);
        cells.push(s || null);
      }
    });
    rawRows.push(cells);
  });

  if (rawRows.length === 0) throw new Error("Spreadsheet appears to be empty");

  const headerRowIdx = detectHeaderRow(rawRows);
  const headerRow = rawRows[headerRowIdx];

  // Build header names, de-duplicate
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (const h of headerRow) {
    const base = h != null ? String(h).trim() : "Column";
    const count = seen.get(base) ?? 0;
    headers.push(count === 0 ? base : `${base}_${count}`);
    seen.set(base, count + 1);
  }

  // Collect data rows (after header row)
  const dataRows: Record<string, CellValue>[] = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const record: Record<string, CellValue> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = row[j] ?? null;
    }
    dataRows.push(record);
  }

  return { headers, dataRows };
}

// ── AI normalisation ──────────────────────────────────────────────────────────

type AiColumnMap = {
  name?: string;
  price?: string;
  quantity?: string;
  brand?: string;
  model?: string;
  vendor?: string;
  notes?: string[];
};

type AiRow = {
  rowIndex: number;
  name: string;
  station: string;
  category: string;
  brand: string;
  model: string;
  vendor: string;
  quantity: number;
  unit_cost_cents: number;
  notes: string;
  skip: boolean;
};

type AiResponse = {
  columnMap: AiColumnMap;
  rows: AiRow[];
};

// Station-to-category mapping used for persistence
const STATION_TO_CATEGORY: Record<string, string> = {
  "Espresso Bar": "espresso_station",
  "Pour Over / Manual Brew": "brew_platform",
  "Batch Brew": "brew_platform",
  "Cold Beverage": "refrigeration",
  "Point of Sale / Cashier": "pos_tech",
  "Front of House / Service": "furniture_fixtures",
  "Kitchen / Food Prep": "furniture_fixtures",
  "Back of House": "plumbing_water",
  "Furniture & Seating": "furniture_fixtures",
  "Decor & Ambiance": "signage_decor",
  "Smallwares": "smallwares",
  "Cleaning & Sanitation": "smallwares",
};

function stationToCategory(station: string): string {
  return STATION_TO_CATEGORY[station] ?? "miscellaneous";
}

async function aiNormalise(
  headers: string[],
  dataRows: Record<string, CellValue>[]
): Promise<AiResponse> {
  const client = new Anthropic();

  // Send at most 60 rows to the AI to keep prompt size reasonable
  const sample = dataRows.slice(0, 60);

  const prompt = `You are parsing a coffee shop equipment spreadsheet.

## Headers found
${headers.map((h, i) => `${i}: "${h}"`).join("\n")}

## Sample rows (first ${sample.length} data rows, 0-indexed)
${JSON.stringify(sample, null, 2)}

## Your tasks

### 1. Column mapping
Map the header names to standard equipment fields. Use empty string if no column maps to that field.
- name: item/product name (e.g. "Item", "Description", "Product Name", "Equipment")
- price: unit cost / price (e.g. "Cost", "Price", "Unit Price", "$", "Amount")
- quantity: quantity / count (e.g. "Qty", "Quantity", "#", "Count", "Amount")
- brand: manufacturer / brand (e.g. "Brand", "Make", "Manufacturer")
- model: model number or name (e.g. "Model", "Model #", "Part #", "SKU")
- vendor: supplier / distributor / vendor (e.g. "Vendor", "Supplier", "From", "Source")
- notes: any remaining columns that look like notes/descriptions (return as array of header names)

### 2. Row normalisation
For EACH data row (use the 0-indexed rowIndex from the sample):
- name: extract the item name from the name column. Apply Title Case (capitalise every word except articles/short prepositions/conjunctions; keep acronyms ALL CAPS: EK43, WDT, RDT, PID, POS, HVAC, PUQpress).
- station: infer the best station from this list: "Espresso Bar", "Pour Over / Manual Brew", "Batch Brew", "Cold Beverage", "Point of Sale / Cashier", "Front of House / Service", "Kitchen / Food Prep", "Back of House", "Furniture & Seating", "Decor & Ambiance", "Smallwares", "Cleaning & Sanitation". Default "Smallwares".
- category: one of espresso_station, brew_platform, milk_beverage_prep, refrigeration, plumbing_water, electrical, pos_tech, furniture_fixtures, signage_decor, smallwares, ceramics, glassware, to_go_ware, miscellaneous
- brand: brand/manufacturer value, Title Case
- model: model value, preserve as-is
- vendor: vendor/supplier value, Title Case
- quantity: integer quantity (default 1 if blank/missing)
- unit_cost_cents: integer cents (multiply dollar amount × 100; default 0)
- notes: concatenate all notes-column values for this row (non-empty only)
- skip: true if the row looks like a subtotal, grand total, header repeat, or completely empty

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "columnMap": {
    "name": "<header or empty>",
    "price": "<header or empty>",
    "quantity": "<header or empty>",
    "brand": "<header or empty>",
    "model": "<header or empty>",
    "vendor": "<header or empty>",
    "notes": ["<header>", ...]
  },
  "rows": [
    {
      "rowIndex": 0,
      "name": "...",
      "station": "...",
      "category": "...",
      "brand": "...",
      "model": "...",
      "vendor": "...",
      "quantity": 1,
      "unit_cost_cents": 0,
      "notes": "...",
      "skip": false
    }
  ]
}`;

  const msg = await client.messages.create({
    model: PLATFORM_AI_MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Strip any accidental markdown fences
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  try {
    return JSON.parse(clean) as AiResponse;
  } catch {
    throw new Error(`AI returned non-JSON: ${clean.slice(0, 200)}`);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rule 4: rate-limit a paid-API route.
  const rateLimited = await enforceRateLimit({
    bucket: "buildout:import",
    id: user.id,
    limit: 10,
    windowSec: 60,
  });
  if (rateLimited) return rateLimited;

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "Missing file field" }, { status: 400 });
  }

  const filename = file.name.toLowerCase();
  if (!filename.endsWith(".xlsx") && !filename.endsWith(".csv")) {
    return Response.json({ error: "Only .xlsx and .csv files are supported" }, { status: 400 });
  }

  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  }

  let parsed: { headers: string[]; dataRows: Record<string, CellValue>[] };
  try {
    const arrayBuffer = await file.arrayBuffer();
    parsed = await parseWorkbook(Buffer.from(arrayBuffer), filename);
  } catch (err) {
    console.error("spreadsheet parse error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not parse spreadsheet" },
      { status: 422 }
    );
  }

  if (parsed.dataRows.length === 0) {
    return Response.json({ error: "No data rows found after header row" }, { status: 422 });
  }

  let aiResult: AiResponse;
  try {
    aiResult = await aiNormalise(parsed.headers, parsed.dataRows);
  } catch (err) {
    console.error("AI normalise error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "AI parse failed" },
      { status: 500 }
    );
  }

  // Build final preview rows — apply toTitleCase at the boundary
  const rows: ParsedRow[] = aiResult.rows.map((r) => ({
    _id: String(r.rowIndex),
    name: toTitleCase(r.name ?? ""),
    section_name: r.station ?? "Smallwares",
    vendor: toTitleCase(r.brand ?? ""),
    model: r.model ?? "",
    supplier: toTitleCase(r.vendor ?? ""),
    quantity: typeof r.quantity === "number" && r.quantity > 0 ? r.quantity : 1,
    unit_cost_cents: typeof r.unit_cost_cents === "number" ? Math.round(r.unit_cost_cents) : 0,
    notes: r.notes ?? "",
    category: r.category ?? stationToCategory(r.station ?? ""),
    skip: r.skip === true,
  }));

  return Response.json({ rows, columnMap: aiResult.columnMap });
}
