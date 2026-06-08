// TIM-2434: Document Import credit estimator.
//
// Pure function — no IO, no Supabase, no Anthropic. Given a parsed file
// inventory (file type + page count) returns the credit estimate the user
// confirms BEFORE the extraction worker spends anything.
//
// Per the UX spec on TIM-2433:
//   PDF (text layer)  ~2 credits/page
//   PDF (image/scan)  ~4 credits/page
//   DOCX              ~1 credit per 500 words
//   XLSX/CSV          ~1 credit per 50 rows
//   Image (PNG/JPG)   ~4 credits/image
//
// We round UP per file then sum so an estimate never under-shoots the actual
// cost. Minimum charge per file is 1 credit. The "image PDF" path is set by
// the parser when the PDF has no extractable text layer.

export type ImportFileType =
  | "pdf"
  | "pdf_scan"
  | "docx"
  | "xlsx"
  | "csv"
  | "png"
  | "jpg";

export interface EstimateFileInput {
  fileType: ImportFileType;
  /** Pages (PDF), rows (XLSX/CSV), words (DOCX) or 1 (image). */
  unitCount: number;
}

export interface EstimateBreakdown {
  total: number;
  perFile: Array<{
    fileType: ImportFileType;
    unitCount: number;
    credits: number;
  }>;
}

const MIN_CREDITS_PER_FILE = 1;

export function estimateCreditsPerFile(file: EstimateFileInput): number {
  const u = Math.max(0, Math.floor(file.unitCount));
  let raw: number;
  switch (file.fileType) {
    case "pdf":
      raw = u * 2;
      break;
    case "pdf_scan":
      raw = u * 4;
      break;
    case "docx":
      raw = u / 500;
      break;
    case "xlsx":
    case "csv":
      raw = u / 50;
      break;
    case "png":
    case "jpg":
      raw = 4;
      break;
    default:
      raw = MIN_CREDITS_PER_FILE;
  }
  return Math.max(MIN_CREDITS_PER_FILE, Math.ceil(raw));
}

export function estimateCredits(files: EstimateFileInput[]): EstimateBreakdown {
  const perFile = files.map((f) => ({
    fileType: f.fileType,
    unitCount: f.unitCount,
    credits: estimateCreditsPerFile(f),
  }));
  const total = perFile.reduce((s, r) => s + r.credits, 0);
  return { total, perFile };
}
