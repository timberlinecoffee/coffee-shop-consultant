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

export interface ConsistencyContradiction {
  kind: "numerical" | "categorical" | "temporal" | "other";
  claim_a: string;
  claim_b: string;
  explanation: string;
}

export interface WriteAiApproveExtras {
  estimatedClaims: unknown[];
  consistencyContradictions: ConsistencyContradiction[];
}

// TIM-3672 follow-up: single trimmed excerpt from another populated BP
// section, used to seed the current section's draft with cross-section
// context. Parent computes this list (excludes the target section,
// placeholders, empty content, archived) so the modal stays presentational.
export interface BpOtherSectionExcerpt {
  title: string;
  excerpt: string;
}

interface Props {
  sectionKey: string;
  sectionTitle: string;
  shopName: string;
  initialContent: string;
  onClose: () => void;
  // TIM-3675 review-fix: onApprove takes both the final text AND the SSE-done
  // extras (estimated_claims + consistency_contradictions) so the workspace
  // PATCHes estimated_claims_json alongside user_content. Without this the
  // TIM-2342 export-gate validator would surface stale claims that no longer
  // appear in the draft.
  onApprove: (finalText: string, extras: WriteAiApproveExtras) => Promise<void>;
  // TIM-3672 follow-up (board comment db265403 on 2026-07-08): "Seed from
  // other sections" button. Parent passes populated non-placeholder excerpts
  // from every OTHER BP section (standard + custom). Empty → button hidden.
  otherSectionsForContext?: BpOtherSectionExcerpt[];
}

type Step = "input" | "generating" | "preview" | "committing" | "done";

// TIM-3675 review-fix: shared placeholder-detection used by the workspace's
// modal-opener callbacks (so we don't pre-populate the modal with an
// assembled-content placeholder like "Complete the Marketing workspace to
// populate this section"). Exported so both callers stay in sync.
export function isBpPlaceholderContent(content: string | null | undefined): boolean {
  if (!content) return true;
  return (
    content.includes("workspace to populate") ||
    content.includes("Click Generate") ||
    content.includes("Complete the other") ||
    content.includes("Complete the Marketing") ||
    content.includes("click the text field")
  );
}

function sanitizeContradictions(raw: unknown): ConsistencyContradiction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const obj = c as Record<string, unknown>;
      const kind = obj.kind;
      const claimA = typeof obj.claim_a === "string" ? obj.claim_a : "";
      const claimB = typeof obj.claim_b === "string" ? obj.claim_b : "";
      const explanation = typeof obj.explanation === "string" ? obj.explanation : "";
      if (!claimA || !claimB) return null;
      const normalizedKind: ConsistencyContradiction["kind"] =
        kind === "numerical" || kind === "categorical" || kind === "temporal" || kind === "other"
          ? kind
          : "other";
      return { kind: normalizedKind, claim_a: claimA, claim_b: claimB, explanation };
    })
    .filter((c): c is ConsistencyContradiction => c !== null);
}

export function BPWriteWithAIModal({
  sectionKey,
  sectionTitle,
  shopName,
  initialContent,
  onClose,
  onApprove,
  otherSectionsForContext,
}: Props) {
  const [content, setContent] = useState(initialContent);
  const [instructions, setInstructions] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [streamingBuf, setStreamingBuf] = useState("");
  const [proposedText, setProposedText] = useState<string | null>(null);
  const [estimatedClaims, setEstimatedClaims] = useState<unknown[]>([]);
  const [contradictions, setContradictions] = useState<ConsistencyContradiction[]>([]);
  const [error, setError] = useState<string | null>(null);
  // TIM-3672 follow-up: gate the seed button after one click so a user can't
  // duplicate the excerpt block by clicking twice. Reset when the user pastes
  // a fresh draft by wiping to empty, or when Reject bounces us back to input.
  const [hasSeededContext, setHasSeededContext] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // TIM-3675 review-fix: cleared on unmount so a rapid remount doesn't fire
  // the "done → close" timer against a stale onClose captured from the prior
  // render.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  async function handleGenerate() {
    setError(null);
    setStreamingBuf("");
    setProposedText(null);
    setEstimatedClaims([]);
    setContradictions([]);
    setStep("generating");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Route decision: /improve rewrites whatever draft is in the textarea;
    // /generate assembles from workspace data. Custom sections don't have a
    // section spec in /generate (buildBpSectionPrompt.BP_SECTION_SPECS misses
    // "custom"), so ALWAYS route custom sections through /improve — using a
    // seed prompt if the draft is empty. Matches the pre-TIM-3675 behavior of
    // handleCustomSectionWriteWithAi.
    const trimmed = content.trim();
    const trimmedInstructions = instructions.trim();
    const isCustom = sectionKey === "custom";
    const useImprove = isCustom || trimmed.length > 0;
    const url = useImprove
      ? "/api/business-plan/improve"
      : "/api/business-plan/generate";

    // For custom empty sections, seed with a first-draft directive so the
    // /improve prompt has something concrete to rewrite. The instructions
    // field still applies on top.
    const effectiveDraft = isCustom && trimmed.length === 0
      ? `Write a first draft for the "${sectionTitle}" section.`
      : trimmed;

    const body: Record<string, unknown> = useImprove
      ? {
          sectionKey,
          sectionTitle,
          currentContent: effectiveDraft,
          shopName,
          instructions: trimmedInstructions || undefined,
        }
      : {
          sectionKey,
          instructions: trimmedInstructions || undefined,
        };

    // TIM-3675 review-fix: track whether the SSE done event fired inside the
    // loop so the post-loop fallback doesn't double-transition on a stale
    // closure and overwrite the server-normalized final text with the raw
    // accumulated buffer.
    let sawDone = false;

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
              sawDone = true;
              const final = ((parsed.text as string) ?? "") || full;
              // TIM-2342: capture estimated_claims for PATCH-time persistence.
              // TIM-2343: capture consistency_contradictions for preview
              // advisory band. Both round-trip through onApprove.
              const claims = Array.isArray(parsed.estimated_claims)
                ? (parsed.estimated_claims as unknown[])
                : [];
              setEstimatedClaims(claims);
              setContradictions(sanitizeContradictions(parsed.consistency_contradictions));
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

      // Post-loop fallback: only fire when the server closed the stream
      // without a "done" event AND we accumulated text. Guards against a
      // truncated SSE frame at network end. Guard uses a local `sawDone`
      // bool — not `proposedText`/`step` from the pre-loop closure, which
      // would always look stale.
      if (!sawDone && full.trim().length > 0) {
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
      await onApprove(proposedText, {
        estimatedClaims,
        consistencyContradictions: contradictions,
      });
      setStep("done");
      // TIM-3675 review-fix: track the close-timer in a ref so unmount
      // (parent nulls bpWriteAiTarget, or the user opens a different
      // section's modal within 600ms) clears it.
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        onClose();
      }, 600);
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

  // TIM-3672 follow-up: assemble other-section excerpts into a labeled block
  // and append to the draft field. Uses a clear divider so the AI treats it
  // as reference context (and so the user can easily strip it before Generate
  // if they want a clean draft). Idempotent per modal session via
  // `hasSeededContext`.
  function handleSeedFromOtherSections() {
    if (hasSeededContext) return;
    const excerpts = otherSectionsForContext ?? [];
    if (excerpts.length === 0) return;
    const block = excerpts
      .map((e) => `**${e.title}:**\n${e.excerpt.trim()}`)
      .join("\n\n");
    const header = `Context from other business plan sections (edit or remove any lines you don't want the AI to use):\n\n${block}`;
    const currentTrimmed = content.trim();
    const next = currentTrimmed.length > 0 ? `${content}\n\n---\n\n${header}` : header;
    setContent(next);
    setHasSeededContext(true);
    // Focus the textarea so the founder can immediately tweak the seed. Move
    // the caret to the end of the appended block.
    requestAnimationFrame(() => {
      const el = contentRef.current;
      if (!el) return;
      el.focus();
      const pos = el.value.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        // Some browsers throw on textarea setSelectionRange during focus
        // transitions; safe to ignore — the append still landed.
      }
      el.scrollTop = el.scrollHeight;
    });
  }

  // TIM-3675 review-fix: Generate is now enabled when EITHER the draft OR
  // the instructions field has content. Empty custom sections seed a
  // first-draft directive server-side, and empty standard sections route
  // through /generate (workspace-snapshot synthesis) — both are valid.
  const canGenerate =
    step === "input" &&
    (content.trim().length > 0 ||
      instructions.trim().length > 0 ||
      sectionKey === "executive-summary");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40"
      onClick={(e) => {
        // TIM-3675 review-fix: backdrop close is only safe in the "input"
        // state. Once a draft is generating, previewing, or committing, a
        // stray backdrop click would silently discard the draft the user
        // just spent an AI credit on. Force explicit Reject/Approve/Close.
        if (e.target === e.currentTarget && step === "input") {
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
              {/* TIM-3675 review-fix: colon separator instead of an em dash
                  to match the product voice rule (no em dashes in UI copy). */}
              <h2 className="text-base font-bold text-[var(--foreground)]">
                Write with AI: {sectionTitle}
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
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <label
                    htmlFor="bp-wai-content"
                    className="block text-xs font-semibold text-[var(--foreground)]"
                  >
                    Current draft
                  </label>
                  {/* TIM-3672 follow-up: seed the draft with excerpts pulled
                      from other populated BP sections. Hidden when there is
                      nothing to pull. Disabled after one click per session so
                      the user can't stack duplicate blocks. */}
                  {otherSectionsForContext && otherSectionsForContext.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSeedFromOtherSections}
                      disabled={hasSeededContext}
                      className="text-[11px] font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                    >
                      <Sparkles size={11} aria-hidden="true" />
                      {hasSeededContext
                        ? "Context added"
                        : `Seed from other sections (${otherSectionsForContext.length})`}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] mb-1.5">
                  {initialContent.trim().length > 0
                    ? "This is what the section says now. Edit it here if you want to seed the AI with a different starting point."
                    : "Optionally seed the AI with a short draft. Leave empty to have the AI generate from your other workspace inputs."}
                </p>
                <textarea
                  id="bp-wai-content"
                  ref={contentRef}
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

              {/* TIM-2343 / TIM-3675 review-fix: surface any unresolved
                  self-consistency contradictions the proofreader flagged, so
                  the founder can spot claim-pair conflicts BEFORE approving.
                  Rendered as an amber advisory band, non-blocking. */}
              {contradictions.length > 0 && (
                <div className="rounded-xl border border-[var(--warning-bg)] bg-[var(--warning-bg-3)] px-4 py-3">
                  <p className="text-xs font-semibold text-[var(--warning-text)] mb-1.5 uppercase tracking-wide">
                    Check these before approving
                  </p>
                  <ul className="space-y-1.5 text-xs text-[var(--foreground)] list-disc list-outside pl-4">
                    {contradictions.slice(0, 5).map((c, i) => (
                      <li key={i} className="leading-relaxed">
                        <span className="font-semibold">{c.claim_a}</span> vs.{" "}
                        <span className="font-semibold">{c.claim_b}</span>
                        {c.explanation ? <span className="text-[var(--muted-foreground)]"> ({c.explanation})</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
