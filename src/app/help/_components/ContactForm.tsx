"use client";

// TIM-1941: customer-facing support form.
// Posts to /api/support, which writes a row in `support_messages` and emails
// hello@timberline.coffee. Form styling matches the canonical workspace
// chrome (text-xs labels, teal focus, rounded-lg, WorkspaceActionButton for
// the submit) so it sits next to the docs index without any drift.

import { useCallback, useState } from "react";
import { Send } from "lucide-react";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { TurnstileWidget } from "@/app/_components/TurnstileWidget";

type FieldErrors = Partial<
  Record<"name" | "email" | "subject" | "message", string>
>;

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; fields?: FieldErrors };

const INPUT_CLS =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[var(--teal)]/15 disabled:opacity-60";

const LABEL_CLS =
  "block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-1.5";

export function ContactForm() {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  // TIM-2246: Turnstile token; null until the widget completes or unset env.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const onTurnstile = useCallback((token: string | null) => setTurnstileToken(token), []);

  const submitting = state.kind === "submitting";
  const fieldErrors = state.kind === "error" ? state.fields ?? {} : {};

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setState({ kind: "submitting" });

    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      subject: String(fd.get("subject") ?? "").trim(),
      message: String(fd.get("message") ?? "").trim(),
      hp: String(fd.get("hp") ?? ""),
      page_url:
        typeof window !== "undefined" ? window.location.href : "",
      cf_turnstile_token: turnstileToken,
    };

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        form.reset();
        setState({ kind: "success" });
        return;
      }

      const body = (await res.json().catch(() => null)) as
        | { error?: string; fields?: FieldErrors }
        | null;

      if (res.status === 400 && body?.error === "validation") {
        setState({
          kind: "error",
          message: "Please fix the highlighted fields.",
          fields: body.fields,
        });
        return;
      }

      setState({
        kind: "error",
        message:
          "We couldn't send your message right now. Please try again, or email hello@timberline.coffee directly.",
      });
    } catch {
      setState({
        kind: "error",
        message:
          "We couldn't reach our servers. Please try again, or email hello@timberline.coffee directly.",
      });
    }
  }

  if (state.kind === "success") {
    return (
      <div
        className="rounded-xl border border-[var(--teal)]/30 bg-[var(--teal)]/5 p-5"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-semibold text-[var(--teal)] mb-1">
          Message sent
        </p>
        <p className="text-sm text-[var(--foreground)]">
          Thanks. A human at Timberline Coffee School will get back to you
          within one business day. We&rsquo;ve also emailed{" "}
          <a
            href="mailto:hello@timberline.coffee"
            className="text-[var(--teal)] hover:underline font-semibold"
          >
            hello@timberline.coffee
          </a>{" "}
          a copy of your note.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-4 text-xs font-semibold text-[var(--teal)] hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-xl border border-[var(--border)] bg-white p-5 sm:p-6"
      aria-describedby={state.kind === "error" ? "support-form-error" : undefined}
    >
      {/* Honeypot — hidden from real users, irresistible to bots. */}
      <div
        style={{
          position: "absolute",
          left: "-10000px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <label htmlFor="hp">Leave this empty</label>
        <input id="hp" name="hp" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="support-name" className={LABEL_CLS}>
            Your name
          </label>
          <input
            id="support-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            disabled={submitting}
            maxLength={200}
            className={INPUT_CLS}
            aria-invalid={fieldErrors.name ? "true" : undefined}
            aria-describedby={
              fieldErrors.name ? "support-name-error" : undefined
            }
          />
          {fieldErrors.name && (
            <p
              id="support-name-error"
              className="mt-1 text-xs text-[var(--destructive)]"
            >
              {fieldErrors.name}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="support-email" className={LABEL_CLS}>
            Email
          </label>
          <input
            id="support-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={submitting}
            maxLength={320}
            className={INPUT_CLS}
            aria-invalid={fieldErrors.email ? "true" : undefined}
            aria-describedby={
              fieldErrors.email ? "support-email-error" : undefined
            }
          />
          {fieldErrors.email && (
            <p
              id="support-email-error"
              className="mt-1 text-xs text-[var(--destructive)]"
            >
              {fieldErrors.email}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="support-subject" className={LABEL_CLS}>
          Subject
        </label>
        <input
          id="support-subject"
          name="subject"
          type="text"
          required
          disabled={submitting}
          maxLength={200}
          className={INPUT_CLS}
          aria-invalid={fieldErrors.subject ? "true" : undefined}
          aria-describedby={
            fieldErrors.subject ? "support-subject-error" : undefined
          }
        />
        {fieldErrors.subject && (
          <p
            id="support-subject-error"
            className="mt-1 text-xs text-[var(--destructive)]"
          >
            {fieldErrors.subject}
          </p>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="support-message" className={LABEL_CLS}>
          Message
        </label>
        <textarea
          id="support-message"
          name="message"
          required
          disabled={submitting}
          rows={6}
          maxLength={8000}
          className={`${INPUT_CLS} resize-y min-h-[140px]`}
          aria-invalid={fieldErrors.message ? "true" : undefined}
          aria-describedby={
            fieldErrors.message ? "support-message-error" : undefined
          }
        />
        {fieldErrors.message && (
          <p
            id="support-message-error"
            className="mt-1 text-xs text-[var(--destructive)]"
          >
            {fieldErrors.message}
          </p>
        )}
      </div>

      {state.kind === "error" && (
        <p
          id="support-form-error"
          role="alert"
          className="mt-4 text-xs text-[var(--destructive)]"
        >
          {state.message}
        </p>
      )}

      <TurnstileWidget onVerify={onTurnstile} className="mt-4" />

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-[11px] text-[var(--muted-foreground)]">
          We typically respond within one business day.
        </p>
        <WorkspaceActionButton
          variant="primary"
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          <Send size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
          {submitting ? "Sending…" : "Send message"}
        </WorkspaceActionButton>
      </div>
    </form>
  );
}
