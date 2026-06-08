// TIM-2434: Document Import extraction service.
//
// One canonical "extract" turn per parsed document. Per the issue spec:
//   - Haiku for short docs (parse/classify) — fast, cheap, fine for menus +
//     short SOPs + 1-page financial summaries.
//   - Sonnet 4.6 for long docs (≥ ~6 page-equivalents or ≥ 8 000 characters
//     of text). Stronger reasoning required to map a long business plan into
//     the suite schema without losing structure.
//
// Returns the extracted document + the Anthropic usage block so the route can
// `await recordTurnMetric(...)` per the Vercel await rule (TIM-2361).

import Anthropic from "@anthropic-ai/sdk";
import { PLATFORM_AI_MODEL, RESEARCH_AI_MODEL } from "../ai/models.ts";
import type { ParsedDocument } from "./parsers.ts";
import {
  ExtractedDocumentSchema,
  type ExtractedDocument,
} from "./extract-schema.ts";

const LONG_DOC_PAGE_THRESHOLD = 6;
const LONG_DOC_CHAR_THRESHOLD = 8000;

const SYSTEM_PROMPT = `You map an uploaded business document into the founder's three planning suites.

Return JSON: { "proposedChanges": [...] } where each item is:
  { "suite": "business_plan"|"financials"|"concept_brand",
    "fieldKey": "<snake_case key>",
    "fieldLabel": "<human label>",
    "proposedValue": "<the value>",
    "sourceFileName": "<the file name passed in>",
    "confidence": "high"|"medium"|"low" }

Rules:
  - Only emit a change if the document clearly contains the value.
  - Do not invent numbers. If a figure is approximate in the doc, mark confidence "medium".
  - If the doc has no relevant content, return { "proposedChanges": [] }.
  - Do not propose more than 60 changes per document. Keep the highest-value ones.
  - Voice: sentence case, no em dashes, no marketing fluff.

Suite field-key vocabulary (use these when applicable; otherwise emit a clear snake_case key):
  business_plan: executive_summary, mission, target_market, problem_statement,
    competitors, swot_strengths, swot_weaknesses, opening_strategy
  financials: rent_monthly, startup_costs_total, total_raise, payroll_monthly,
    cogs_pct, ticket_size_avg, monthly_revenue_target, opening_cash
  concept_brand: brand_name, tagline, palette_primary, palette_secondary,
    typography_primary, brand_voice, logo_description`;

export type ExtractTier = "haiku" | "sonnet";

export interface ExtractInput {
  parsed: ParsedDocument;
  fileName: string;
  /** Optional raw bytes — sent as Claude document/image block for PDF/PNG/JPG. */
  bytes?: Buffer;
  apiKey?: string;
}

export interface ExtractOutput {
  extracted: ExtractedDocument;
  tier: ExtractTier;
  modelUsed: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
  errorCode?: "extraction_failed" | "no_content";
}

export function pickTier(parsed: ParsedDocument): ExtractTier {
  if (
    parsed.unitCount >= LONG_DOC_PAGE_THRESHOLD ||
    parsed.text.length >= LONG_DOC_CHAR_THRESHOLD
  ) {
    return "sonnet";
  }
  return "haiku";
}

export async function extractDocument(input: ExtractInput): Promise<ExtractOutput> {
  const { parsed, fileName, bytes } = input;
  const tier = pickTier(parsed);
  const model = tier === "sonnet" ? RESEARCH_AI_MODEL : PLATFORM_AI_MODEL;

  if (parsed.errorCode === "unreadable_scan") {
    return {
      extracted: { proposedChanges: [] },
      tier,
      modelUsed: model,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      errorCode: "no_content",
    };
  }

  const apiKey = input.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      extracted: { proposedChanges: [] },
      tier,
      modelUsed: model,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      errorCode: "extraction_failed",
    };
  }

  const client = new Anthropic({ apiKey });

  // Use SDK content-block typing via `as never` on each block. The SDK accepts
  // image + document base64 blocks; we keep the block array loosely typed
  // because the public ContentBlockParam union is wide and we don't import it
  // explicitly. Anthropic API rejects unknown blocks with 400, so a malformed
  // shape would fail at call time and be caught below.
  type ContentBlock = {
    type: "text" | "image" | "document";
    text?: string;
    source?: { type: "base64"; media_type: string; data: string };
  };
  const content: ContentBlock[] = [
    {
      type: "text",
      text: `File name: ${fileName}\n\nDocument text (may be truncated):\n${parsed.text.slice(0, 60000)}`,
    },
  ];

  if (bytes && (parsed.fileType === "png" || parsed.fileType === "jpg")) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: parsed.fileType === "png" ? "image/png" : "image/jpeg",
        data: bytes.toString("base64"),
      },
    });
  } else if (
    bytes &&
    (parsed.fileType === "pdf" || parsed.fileType === "pdf_scan")
  ) {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: bytes.toString("base64"),
      },
    });
  }

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: content as any }],
    });
    const text =
      res.content
        .map((c) =>
          c.type === "text" ? c.text : "",
        )
        .join("")
        .trim() || "{}";
    const parsedJson = safeParseJson(text);
    const validated = ExtractedDocumentSchema.safeParse(parsedJson);
    if (!validated.success) {
      return {
        extracted: { proposedChanges: [] },
        tier,
        modelUsed: model,
        usage: {
          input_tokens: res.usage?.input_tokens ?? 0,
          output_tokens: res.usage?.output_tokens ?? 0,
          cache_read_input_tokens: res.usage?.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens:
            res.usage?.cache_creation_input_tokens ?? 0,
        },
        errorCode: "extraction_failed",
      };
    }
    return {
      extracted: validated.data,
      tier,
      modelUsed: model,
      usage: {
        input_tokens: res.usage?.input_tokens ?? 0,
        output_tokens: res.usage?.output_tokens ?? 0,
        cache_read_input_tokens: res.usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens:
          res.usage?.cache_creation_input_tokens ?? 0,
      },
      errorCode:
        validated.data.proposedChanges.length === 0 ? "no_content" : undefined,
    };
  } catch {
    return {
      extracted: { proposedChanges: [] },
      tier,
      modelUsed: model,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      errorCode: "extraction_failed",
    };
  }
}

function safeParseJson(raw: string): unknown {
  // The LLM sometimes wraps JSON in a ```json fence; strip if present.
  const trimmed = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to recover the first balanced {...} block.
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}
