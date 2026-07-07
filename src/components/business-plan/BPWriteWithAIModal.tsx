"use client";

// TIM-3675: Business Plan per-section Write with AI modal.
//
// Flow: input (pre-populated content + optional instructions) → generate
// (SSE stream) → preview (approve merges, reject returns to input with
// instructions preserved). Replaces the direct-stream + AIReviewModal chain
// used for BP per-section improve/generate. Board scope on TIM-3675:
//   - button stays visible even when the user is manually editing;
//   - modal opens with current content pre-filled and editable;
//   - separate optional Instructions field;
//   - AI output shown for approval before merging;
//   - reject → tweak instructions and regenerate without closing.
//
// Style guide sections consulted: Buttons → Primary, Cards → Modal, Inputs
// → Text. Existing component reference: src/components/buildout/WriteWithAIModal.tsx
// (E&S variant) — same modal chrome, same teal action button, same loading
// / error affordances.

import { useEffect, useRef, useState } from "react";
import { X, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

interface Props {
  sectionKey: string;
  sectionTitle: string;
  shopName: string;
  initialContent: string;
  onClose: () => void;
  onApprove: (finalText: string) => Promise<void>;
}

type Step = "input" | "generating" | "preview" | "committing" | "done";

export function BPWriteWithAIModal({
  sectionKey,
  sectionTitle,
  shopName,
  initialContent,
  onClose,
  onApprove,
}: Props) {
  const [content, setContent] = useState(initialContent);
  const [instructions, setInstructions] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [streamingBuf, setStreamingBuf] = useState("");
  const [proposedText, setProposedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleGenerate() {
    setError(null);
    setStreamingBuf("");
    setProposedText(null);
    setStep("generating");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Empty content + empty instructions is only meaningful on the generate
    // endpoint. Otherwise the improve endpoint handles both — with the
    // pre-populated content acting as the draft to rewrite. Route by content
    // presence (matches the pre-modal behavior in business-plan-workspace).
    const trimmed = content.trim();
    const trimmedInstructions = instructions.trim();
    const useImprove = trimmed.length > 0;
    const url = useImprove
      ? "/api/business-plan/improve"
      : "/api/business-plan/generate";

    const body: Record<string, unknown> = useImprove
      ? {
          sectionKey,
          sectionTitle,
          currentContent: trimmed,
          shopName,
          instructions: trimmedInstructions || undefined,
        }
      : {
          sectionKey,
          instructions: trimmedInstructions || undefined,
        };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.status === 402) {
          setError("AI credits required. Upgrade your plan to use this feature.");
        } else if (res.status === 429) {
          setError("Too many requests. Wait a moment and try again.");
        } else {
          setError((j.error as string) ?? "Request failed");
        }
        setStep("input");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("No response stream");
        setStep("input");
        return;
      }

      const dec = new TextDecoder();
      let buf = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let evt = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) evt = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (evt === "text") {
              const chunk = (parsed.text as string) ?? "";
              full += chunk;
              setStreamingBuf((prev) => prev + chunk);
            } else if (evt === "done") {
              const final = ((parsed.text as string) ?? "") || full;
              setProposedText(final);
              setStep("preview");
            } else if (evt === "error") {
              setError((parsed.message as string) ?? "Error");
              setStep("input");
            }
          } catch {
            // Ignore malformed SSE events.
          }
        }
      }

      if (!proposedText && full.trim().length > 0 && step !== "preview") {
        setProposedText(full);
        setStep("preview");
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
      setStep("input");
    }
  }

  async function handleApprove() {
    if (!proposedText) return;
    setStep("committing");
    try {
      await onApprove(proposedText);
      setStep("done");
      // Small hold on "done" so the user sees the success state; then close.
      setTimeout(() => onClose(), 600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
      setStep("preview");
    }
  }

  function handleReject() {
    // Keep instructions + edited content so the user can iterate. Wipe the
    // proposed output so the input state renders cleanly.
    setProposedText(null);
    setStreamingBuf("");
    setError(null);
    setStep("input");
  }

  const canGenerate =
    step === "input" && (content.trim().length > 0 || sectionKey === "executive-summary");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "generating" && step !== "committing") {
          onClose();
        }
      }}
    >
      <div
        className="relative mt-10 mb-10 mx-4 w-full max-w-3xl bg-background rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} className="text-[var(--teal)]" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-[var(--foreground)]">
                Write with AI — {sectionTitle}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {step === "input" && "Edit the draft and tell the AI how to improve it."}
                {step === "generating" && "Writing..."}
                {step === "preview" && "Review the draft. Approve to merge, or reject to revise."}
                {step === "committing" && "Saving..."}
                {step === "done" && "Merged."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={step === "generating" || step === "committing"}
            className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 px-6 py-5 overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 200px)" }}
        >
          {/* ── Input ── */}
          {step === "input" && (
            <div className="space-y-5">
              {error && (
                <p className="text-sm text-[var(--error)]">{error}</p>
              )}

              <div>
                <label
                  htmlFor="bp-wai-content"
                  className="block text-xs font-semibold text-[var(--foreground)] mb-1.5"
                >
                  Current draft
                </label>
                <p className="text-[11px] text-[var(--muted-foreground)] mb-1.5">
                  {initialContent.trim().length > 0
                    ? "This is what the section says now. Edit it here if you want to seed the AI with a different starting point."
                    : "Optionally seed the AI with a short draft. Leave empty to have the AI generate from your other workspace inputs."}
                </p>
                <textarea
                  id="bp-wai-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Section content..."
                  rows={8}
                  className="w-full text-sm text-[var(--foreground)] border border-[var(--neutral-cool-350)] rounded-xl px-3 py-2.5 focus:border-[var(--teal)] focus-visible:outline-none placeholder:text-[var(--neutral-cool-400)] leading-relaxed"
                />
              </div>

              <div>
                <label
                  htmlFor="bp-wai-instructions"
                  className="block text-xs font-semibold text-[var(--foreground)] mb-1.5"
                >
                  Instructions <span className="font-normal text-[var(--muted-foreground)]">(optional)</span>
                </label>
                <p className="text-[11px] text-[var(--muted-foreground)] mb-1.5">
                  Tell the AI how to change the draft. Examples: &ldquo;make this shorter&rdquo;,
                  &ldquo;add more detail on how we&rsquo;ll hire the assistant manager&rdquo;,
                  &ldquo;rewrite in first person&rdquo;.
                </p>
                <textarea
                  id="bp-wai-instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="How should the AI change it?"
                  rows={3}
                  className="w-full text-sm text-[var(--foreground)] border border-[var(--neutral-cool-350)] rounded-xl px-3 py-2.5 focus:border-[var(--teal)] focus-visible:outline-none placeholder:text-[var(--neutral-cool-400)] leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* ── Generating ── */}
          {step === "generating" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  Writing this section...
                </span>
              </div>
              {streamingBuf && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--neutral-cool-50)] px-4 py-3 max-h-96 overflow-y-auto">
                  <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                    {streamingBuf}
                  </p>
                </div>
              )}
              <p className="text-xs text-[var(--muted-foreground)]">
                Usually takes 10–30 seconds. This will not overwrite your section until you approve.
              </p>
            </div>
          )}

          {/* ── Preview (approve / reject) ── */}
          {step === "preview" && proposedText && (
            <div className="space-y-4">
              {error && (
                <p className="text-sm text-[var(--error)]">{error}</p>
              )}

              <div>
                <p className="text-xs font-semibold text-[var(--foreground)] mb-2 uppercase tracking-wide">
                  AI Draft
                </p>
                <div className="rounded-xl border border-[var(--teal-bg-d0)] bg-[var(--teal-tint-500)] px-4 py-3 max-h-[440px] overflow-y-auto">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={{
                      h1: ({ children }) => <h1 className="text-lg font-semibold text-[var(--foreground)] mb-2 mt-3 first:mt-0">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-semibold text-[var(--foreground)] mb-1.5 mt-3 first:mt-0">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1 mt-2 first:mt-0">{children}</h3>,
                      p: ({ children }) => <p className="text-sm text-[var(--foreground)] leading-relaxed mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-outside pl-4 mb-2 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-outside pl-4 mb-2 space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li className="text-sm text-[var(--foreground)] leading-relaxed">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-[var(--foreground)]">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                    }}
                  >
                    {proposedText}
                  </ReactMarkdown>
                </div>
              </div>

              {instructions.trim().length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--foreground)] mb-1.5 uppercase tracking-wide">
                    Instructions applied
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)] italic border-l-2 border-[var(--border)] pl-3">
                    {instructions}
                  </p>
                </div>
              )}

              <p className="text-xs text-[var(--muted-foreground)]">
                Approve to merge this into <span className="font-semibold">{sectionTitle}</span>. Reject to
                tweak the instructions and try again.
              </p>
            </div>
          )}

          {/* ── Committing ── */}
          {step === "committing" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Saving to your business plan...
              </p>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-10 h-10 rounded-full bg-[var(--teal-bg-800)] flex items-center justify-center mb-4">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M3.5 9L7.5 13L14.5 5"
                    stroke="var(--teal)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-sm font-bold text-[var(--foreground)]">Section updated</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "input" && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              className="text-sm font-semibold bg-[var(--teal)] text-white px-6 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <Sparkles size={13} aria-hidden="true" />
              Generate
            </button>
          </div>
        )}

        {step === "preview" && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReject}
              className="text-sm font-semibold text-[var(--foreground)] border border-[var(--gray-750)] px-4 py-2 rounded-lg hover:bg-[var(--neutral-cool-100)] transition-colors"
            >
              Reject and revise
            </button>
            <button
              type="button"
              onClick={() => void handleApprove()}
              className="text-sm font-semibold bg-[var(--teal)] text-white px-6 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors"
            >
              Approve and merge
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
