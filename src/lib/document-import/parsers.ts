// TIM-2434: parsing layer for the document-import pipeline.
//
// Each parser takes the raw file bytes + metadata and returns a normalised
// `ParsedDocument` for the extraction LLM call. Page count is the unit used
// by the credit estimator (TIM-2434 estimate rules); for DOCX/XLSX/CSV we
// translate words/rows back into "page-equivalent" via the credit estimator's
// per-type rate so the user sees one stable number on screen.
//
// Standing rule 5 — every parser catches and returns a sanitised error_code.
// The route layer maps codes to user copy.

import type { ImportFileType } from "./credit-estimate.ts";

export type ParseErrorCode =
  | "unreadable_scan"
  | "extraction_failed"
  | "file_too_large"
  | "unsupported_format"
  | "no_content";

export interface ParsedDocument {
  /** Normalised type as seen by the extractor + estimator. */
  fileType: ImportFileType;
  /** Plain text extracted from the document (DOCX/XLSX/CSV/PDF text layer). */
  text: string;
  /** Page-equivalent count for the credit estimator. */
  unitCount: number;
  /** Set when the parser cannot proceed. text/unitCount are best-effort. */
  errorCode?: ParseErrorCode;
}

const PDF_SCAN_TEXT_THRESHOLD = 80; // chars per page below which we flag as scan
const DOCX_WORDS_PER_PAGE = 500;
const XLSX_ROWS_PER_PAGE = 50;

export async function parsePdf(bytes: Buffer, _fileName: string): Promise<ParsedDocument> {
  try {
    const mod = await import("pdf-parse");
    const PDFParse = (mod as { PDFParse: new (opts: { data: Uint8Array }) => {
      getText(): Promise<{ pages?: Array<unknown>; text?: string }>;
      destroy(): Promise<void>;
    } }).PDFParse;
    const parser = new PDFParse({
      data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    });
    const result = await parser.getText();
    await parser.destroy().catch(() => {});
    const pages = Math.max(1, result.pages?.length ?? 1);
    const text = (result.text ?? "").trim();
    // Heuristic: scan PDFs have a text layer but it's negligible. Flag as
    // pdf_scan so the estimator charges the image rate.
    if (text.length < pages * PDF_SCAN_TEXT_THRESHOLD) {
      return {
        fileType: "pdf_scan",
        text,
        unitCount: pages,
        errorCode: text.length === 0 ? "unreadable_scan" : undefined,
      };
    }
    return { fileType: "pdf", text, unitCount: pages };
  } catch {
    return {
      fileType: "pdf",
      text: "",
      unitCount: 1,
      errorCode: "extraction_failed",
    };
  }
}

export async function parseDocx(bytes: Buffer): Promise<ParsedDocument> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    const text = (value || "").trim();
    const words = text ? text.split(/\s+/).length : 0;
    if (text.length === 0) {
      return {
        fileType: "docx",
        text: "",
        unitCount: 1,
        errorCode: "no_content",
      };
    }
    return {
      fileType: "docx",
      text,
      unitCount: Math.max(1, Math.ceil(words / DOCX_WORDS_PER_PAGE)),
    };
  } catch {
    return {
      fileType: "docx",
      text: "",
      unitCount: 1,
      errorCode: "extraction_failed",
    };
  }
}

export async function parseXlsx(bytes: Buffer): Promise<ParsedDocument> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new (ExcelJS as { Workbook: new () => unknown }).Workbook() as {
      xlsx: { load(b: Buffer): Promise<void> };
      worksheets: Array<{
        name: string;
        rowCount: number;
        eachRow(opts: unknown, cb: (row: { values: unknown[] }) => void): void;
      }>;
    };
    await wb.xlsx.load(bytes);
    // Cap at 10 sheets per UX spec edge case.
    const sheets = wb.worksheets.slice(0, 10);
    let totalRows = 0;
    const chunks: string[] = [];
    for (const ws of sheets) {
      chunks.push(`# Sheet: ${ws.name}`);
      ws.eachRow({ includeEmpty: false }, (row) => {
        totalRows += 1;
        const cells = (row.values as unknown[]).slice(1).map(formatCell);
        chunks.push(cells.join("\t"));
      });
    }
    if (totalRows === 0) {
      return {
        fileType: "xlsx",
        text: "",
        unitCount: 1,
        errorCode: "no_content",
      };
    }
    return {
      fileType: "xlsx",
      text: chunks.join("\n"),
      unitCount: Math.max(1, Math.ceil(totalRows / XLSX_ROWS_PER_PAGE)),
    };
  } catch {
    return {
      fileType: "xlsx",
      text: "",
      unitCount: 1,
      errorCode: "extraction_failed",
    };
  }
}

export function parseCsv(bytes: Buffer): ParsedDocument {
  const text = bytes.toString("utf8").trim();
  if (!text) {
    return {
      fileType: "csv",
      text: "",
      unitCount: 1,
      errorCode: "no_content",
    };
  }
  const rows = text.split(/\r?\n/).filter((r) => r.length > 0);
  return {
    fileType: "csv",
    text,
    unitCount: Math.max(1, Math.ceil(rows.length / XLSX_ROWS_PER_PAGE)),
  };
}

export function parseImage(
  bytes: Buffer,
  fileType: "png" | "jpg",
): ParsedDocument {
  // Images go straight to the multimodal LLM; we don't OCR locally. The text
  // field stays empty; the extractor adds an image content block at call time.
  return {
    fileType,
    text: "",
    unitCount: 1,
    errorCode: bytes.byteLength === 0 ? "no_content" : undefined,
  };
}

function formatCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in (v as object)) {
    return String((v as { text: unknown }).text ?? "");
  }
  if (typeof v === "object" && "result" in (v as object)) {
    return String((v as { result: unknown }).result ?? "");
  }
  return String(v);
}

export interface ParseInput {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}

const MIME_TO_TYPE: Record<string, ImportFileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export function detectFileType(
  mimeType: string,
  fileName: string,
): ImportFileType | null {
  if (MIME_TO_TYPE[mimeType]) return MIME_TO_TYPE[mimeType];
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "csv") return "csv";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  return null;
}

export async function parseDocument(input: ParseInput): Promise<ParsedDocument> {
  const type = detectFileType(input.mimeType, input.fileName);
  if (!type) {
    return {
      fileType: "pdf",
      text: "",
      unitCount: 1,
      errorCode: "unsupported_format",
    };
  }
  switch (type) {
    case "pdf":
      return parsePdf(input.bytes, input.fileName);
    case "docx":
      return parseDocx(input.bytes);
    case "xlsx":
      return parseXlsx(input.bytes);
    case "csv":
      return parseCsv(input.bytes);
    case "png":
    case "jpg":
      return parseImage(input.bytes, type);
    default:
      return {
        fileType: "pdf",
        text: "",
        unitCount: 1,
        errorCode: "unsupported_format",
      };
  }
}
