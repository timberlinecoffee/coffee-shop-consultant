"use client";

// TIM-2434: Document Import — companion drawer "Import" mode UI.
//
// Three states rendered in-place:
//   1. drop zone + file picker (initial)
//   2. file list + credit estimate (after files selected/uploaded)
//   3. extracting / ready / error (post-Start extraction)
//
// Per the UX spec on TIM-2433: tokens come from the workspace style guide
// (var(--teal), var(--border), bg-teal/5, rounded-2xl drop zone, etc.).
// All buttons rounded-xl. No em dashes in copy.
//
// Talks to /api/document-import/upload → /estimate → /extract.

import { useCallback, useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Table,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";

const ACCEPT =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,image/png,image/jpeg";
const MAX_FILES = 5;
const MAX_BYTES = 50 * 1024 * 1024;

interface FileRow {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  status: "queued" | "extracting" | "complete" | "error" | "no_content";
  error_code?: string | null;
  credits?: number;
}

interface Suggestion {
  id: string;
  fieldId: string;
  fieldLabel: string;
  originalValue: string;
  proposedValue: string;
  workspaceLabel: string;
  provenance: string;
}

interface ApprovedChange {
  suggestionId: string;
  fieldId: string;
  finalValue: string;
  wasEdited: boolean;
}

export interface ImportPanelProps {
  planId: string;
  source: "onboarding" | "settings" | "companion";
  creditBalance: number | null;
  /** Open the unified AIReviewModal with the suggestions returned from extract. */
  openReview: (args: {
    suggestions: Suggestion[];
    onApply: (accepted: ApprovedChange[]) => Promise<void>;
  }) => void;
  /** Hook called after a successful apply so the parent can refresh state. */
  onApplied?: () => void;
}

type Stage = "idle" | "estimating" | "ready" | "extracting" | "complete" | "error";

export function ImportPanel({
  planId,
  source,
  creditBalance,
  openReview,
  onApplied,
}: ImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [importId, setImportId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setStage("idle");
    setImportId(null);
    setFiles([]);
    setEstimate(null);
    setError(null);
  }, []);

  const handleFiles = useCallback(
    async (incoming: FileList | File[]) => {
      setError(null);
      const list = Array.from(incoming);
      if (list.length === 0) return;
      if (list.length > MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files per import.`);
        return;
      }
      for (const f of list) {
        if (f.size > MAX_BYTES) {
          setError(`${f.name} is larger than 50 MB.`);
          return;
        }
      }
      setStage("estimating");
      // Step 1: upload
      const fd = new FormData();
      fd.append("planId", planId);
      fd.append("source", source);
      for (const f of list) fd.append("file", f);
      const upRes = await fetch("/api/document-import/upload", {
        method: "POST",
        body: fd,
      });
      const up = await upRes.json();
      if (!upRes.ok) {
        setError(up.error || "Upload failed.");
        setStage("idle");
        return;
      }
      setImportId(up.importId);
      setFiles(up.files);

      // Step 2: estimate
      const estRes = await fetch("/api/document-import/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: up.importId }),
      });
      const est = await estRes.json();
      if (!estRes.ok) {
        setError(est.error || "Could not estimate credits.");
        setStage("error");
        return;
      }
      setEstimate(est.estimate);
      setStage("ready");
    },
    [planId, source],
  );

  const handleStartExtraction = useCallback(async () => {
    if (!importId) return;
    setStage("extracting");
    setError(null);
    const res = await fetch("/api/document-import/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Extraction failed.");
      setStage("error");
      return;
    }
    // Open the unified review modal with the suite-routed suggestions.
    openReview({
      suggestions: data.suggestions,
      onApply: async (accepted) => {
        const applyRes = await fetch("/api/document-import/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            importId,
            accepted: accepted.map((a) => ({
              fieldId: a.fieldId,
              finalValue: a.finalValue,
            })),
          }),
        });
        if (!applyRes.ok) {
          const j = await applyRes.json().catch(() => ({}));
          throw new Error(j.error || "Could not apply changes.");
        }
        onApplied?.();
      },
    });
    setStage("complete");
  }, [importId, openReview, onApplied]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const insufficientCredits =
    estimate !== null && creditBalance !== null && creditBalance < estimate;

  return (
    <div className="p-4 space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--foreground)]">
          Import Documents
        </h3>
        {creditBalance !== null && (
          <span className="bg-[var(--teal)]/10 text-[var(--teal)] text-xs font-semibold px-2 py-0.5 rounded-full">
            {creditBalance} credits left
          </span>
        )}
      </div>

      {stage === "idle" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
            dragOver
              ? "border-[var(--teal)] bg-[var(--teal)]/5"
              : "border-[var(--border)]"
          }`}
        >
          <UploadCloud
            className="w-8 h-8 mx-auto text-[var(--teal)]"
            aria-hidden
          />
          <p className="mt-2 font-semibold text-[var(--foreground)]">
            Drop files here
          </p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            or{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="underline text-[var(--teal)]"
            >
              browse files
            </button>
          </p>
          <p className="mt-3 text-[11px] text-[var(--muted-foreground)]">
            PDF, DOCX, XLSX, CSV, PNG, JPG · 50 MB max
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
            }}
            data-testid="document-import-file-input"
          />
        </div>
      )}

      {(stage === "estimating" ||
        stage === "ready" ||
        stage === "extracting" ||
        stage === "complete" ||
        stage === "error") &&
        files.length > 0 && (
          <div className="border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
            {files.map((f) => (
              <FileRowView key={f.id} file={f} stage={stage} />
            ))}
          </div>
        )}

      {(stage === "estimating" || stage === "ready") && estimate !== null && (
        <div className="rounded-xl border border-[var(--border)] p-3 space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">
              Estimated cost
            </span>
            <span className="font-semibold text-[var(--teal)]">
              ~{estimate} credits
            </span>
          </div>
          {creditBalance !== null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">
                Your balance
              </span>
              <span
                className={
                  insufficientCredits
                    ? "text-[var(--destructive)] font-semibold"
                    : "text-[var(--muted-foreground)]"
                }
              >
                {creditBalance} credits
              </span>
            </div>
          )}
          {insufficientCredits && (
            <div className="flex items-center gap-2 text-xs text-[var(--destructive)] mt-1">
              <AlertCircle className="w-4 h-4" aria-hidden />
              <span>Not enough credits for this import.</span>
            </div>
          )}
        </div>
      )}

      {stage === "extracting" && (
        <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Extracting content. This may take a minute.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-[var(--destructive)]">
          <AlertCircle className="w-4 h-4 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {stage === "ready" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStartExtraction}
            disabled={insufficientCredits}
            className="bg-[var(--teal)] text-white rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            data-testid="document-import-start"
          >
            Start Extraction
          </button>
          <button
            type="button"
            onClick={reset}
            className="text-sm text-[var(--muted-foreground)] underline"
          >
            Cancel
          </button>
        </div>
      )}

      {stage === "complete" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-[var(--teal)]">
            <CheckCircle2 className="w-4 h-4" aria-hidden />
            Extraction complete. Review the proposed changes in the modal.
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-[var(--muted-foreground)] underline"
          >
            Import Another Document
          </button>
        </div>
      )}

      {stage === "error" && (
        <button
          type="button"
          onClick={reset}
          className="text-sm text-[var(--muted-foreground)] underline"
        >
          Start Over
        </button>
      )}
    </div>
  );
}

function FileRowView({ file, stage }: { file: FileRow; stage: Stage }) {
  const Icon =
    file.file_type === "png" || file.file_type === "jpg"
      ? ImageIcon
      : file.file_type === "xlsx" || file.file_type === "csv"
        ? Table
        : FileText;
  let label: string;
  let chipClass: string;
  if (file.status === "error" || file.error_code) {
    label = file.error_code ? errorLabel(file.error_code) : "Error";
    chipClass = "bg-red-50 text-[var(--destructive)]";
  } else if (file.status === "no_content") {
    label = "No matches found";
    chipClass = "bg-amber-100 text-amber-700";
  } else if (file.status === "complete") {
    label = "Ready for review";
    chipClass = "bg-[var(--teal)]/10 text-[var(--teal)]";
  } else if (stage === "extracting") {
    label = "Extracting...";
    chipClass = "bg-amber-100 text-amber-700 animate-pulse";
  } else {
    label = "Queued";
    chipClass = "bg-neutral-200 text-neutral-600";
  }
  return (
    <div className="flex items-center gap-3 py-2 px-3 text-sm">
      <Icon className="w-4 h-4 text-[var(--muted-foreground)]" aria-hidden />
      <span
        className="flex-1 truncate text-[var(--foreground)]"
        title={file.file_name}
      >
        {file.file_name}
      </span>
      <span className="text-[11px] text-[var(--muted-foreground)]">
        {formatBytes(file.file_size_bytes)}
      </span>
      <span
        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${chipClass}`}
      >
        {label}
      </span>
    </div>
  );
}

function errorLabel(code: string): string {
  switch (code) {
    case "unreadable_scan":
      return "Unreadable scan";
    case "file_too_large":
      return "File too large";
    case "unsupported_format":
      return "Format not supported";
    case "no_content":
      return "No matches found";
    default:
      return "Error";
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
