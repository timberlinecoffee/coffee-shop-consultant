"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1500);
  }

  if (done) {
    return (
      <div className="bg-[var(--teal-bg-pale)] border border-[var(--teal-bg-900)] rounded-xl px-4 py-4 text-sm text-[var(--teal)] text-center">
        Password updated. Redirecting you to your dashboard...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="password" className="block text-xs font-medium text-[var(--foreground)] mb-1">New Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--dark-grey)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-xs font-medium text-[var(--foreground)] mb-1">Confirm Password</label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--dark-grey)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[var(--teal)] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save New Password"}
      </button>
    </form>
  );
}
