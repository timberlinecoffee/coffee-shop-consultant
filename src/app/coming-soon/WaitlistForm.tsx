"use client";

// TIM-2285: waitlist signup form for the Groundwork.AI coming-soon page.
// Single email field → POST /api/waitlist/subscribe → in-place success state.
//
// TIM-3448: Added CASL s.10(1) marketing consent checkbox (unchecked by
// default, express opt-in). Checkbox state sent as `marketing_consent` bool.

import { useState } from "react";
import { TurnstileWidget } from "@/app/_components/TurnstileWidget";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "submitting" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }
    setStatus("submitting");
    setMessage(null);
    try {
      const res = await fetch("/api/waitlist/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          cf_turnstile_token: captchaToken,
          source: "groundwork-ai-coming-soon",
          marketing_consent: marketingConsent,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(
          json.error ||
            "Something went wrong. Please try again in a minute.",
        );
        return;
      }
      setStatus("success");
      setMessage(null);
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        className="rounded-xl px-5 py-5"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.18)",
          backdropFilter: "blur(8px)",
        }}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: "var(--sage)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <p
              className="font-semibold text-white mb-1"
              style={{ fontSize: "17px", lineHeight: 1.35 }}
            >
              You&rsquo;re on the list.
            </p>
            <p
              className="text-white/80"
              style={{ fontSize: "14px", lineHeight: 1.55 }}
            >
              Check your inbox to confirm. We&rsquo;ll email when Groundwork.AI
              opens, with your locked-in launch price.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col sm:flex-row gap-3">
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <input
          id="waitlist-email"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@coffeeshop.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") {
              setStatus("idle");
              setMessage(null);
            }
          }}
          disabled={status === "submitting"}
          aria-invalid={status === "error"}
          aria-describedby={message ? "waitlist-msg" : undefined}
          className="flex-1 rounded-lg px-4 py-3 text-base text-neutral-900 placeholder-neutral-500 focus:outline-none focus:ring-2"
          style={{
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(255,255,255,0.3)",
          }}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex items-center justify-center rounded-lg px-6 py-3 font-semibold text-sm text-white transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          style={{ background: "var(--sage)", whiteSpace: "nowrap" }}
        >
          {status === "submitting" ? "Joining…" : "Join the Waitlist"}
        </button>
      </div>

      {turnstileEnabled && (
        <div className="mt-3">
          <TurnstileWidget onVerify={setCaptchaToken} />
        </div>
      )}

      {status === "error" && message && (
        <p
          id="waitlist-msg"
          className="mt-3 text-sm"
          style={{ color: "#ffd4d4" }}
          role="alert"
        >
          {message}
        </p>
      )}

      {/* TIM-3448: CASL s.10(1) express consent checkbox — unchecked by default */}
      <label className="flex items-start gap-2 mt-3 cursor-pointer">
        <input
          type="checkbox"
          checked={marketingConsent}
          onChange={(e) => setMarketingConsent(e.target.checked)}
          disabled={status === "submitting"}
          className="mt-0.5 w-4 h-4 flex-shrink-0 rounded accent-[--sage]"
          aria-label="Consent to receive launch update emails"
        />
        <span className="text-white/70" style={{ fontSize: "12px", lineHeight: 1.55 }}>
          Email me when we launch, with my locked-in price. Unsubscribe anytime.
        </span>
      </label>
    </form>
  );
}
