"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const COOLDOWN_SECONDS = 60;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (error) {
      // Do not leak whether the email exists; show a generic confirmation unless it's a
      // hard client error (e.g. invalid email) so users can correct typos.
      if (error.message?.toLowerCase().includes("invalid")) {
        setError(error.message);
        return;
      }
    }
    setSubmitted(true);
    setCooldown(COOLDOWN_SECONDS);
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <div className="bg-teal-surface border border-teal-border rounded-xl px-4 py-4 text-sm text-teal">
          If an account exists for <span className="font-medium">{email}</span>, a password reset link is on its way. The link expires in 1 hour and can only be used once.
        </div>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setError(null);
          }}
          disabled={cooldown > 0}
          className="w-full text-center text-xs text-neutral-500 hover:text-neutral-950 transition-colors disabled:opacity-50"
        >
          {cooldown > 0 ? `Send another link in ${cooldown}s` : "Send to a different email"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="email" className="block text-xs font-medium text-neutral-950 mb-1">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full border border-grey-light rounded-xl px-4 py-3 text-sm text-neutral-950 placeholder-neutral-500 focus:outline-none focus:border-teal transition-colors"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || cooldown > 0}
        className="w-full bg-teal text-white py-3 rounded-xl font-semibold text-sm hover:bg-teal-dark transition-colors disabled:opacity-50"
      >
        {loading ? "Sending..." : cooldown > 0 ? `Try again in ${cooldown}s` : "Send reset link"}
      </button>
    </form>
  );
}
