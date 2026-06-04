"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { TurnstileWidget } from "@/app/_components/TurnstileWidget";

export function LoginForm({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [consent, setConsent] = useState(false);
  // TIM-2246: Turnstile attestation token, passed to Supabase Auth via
  // options.captchaToken. Supabase verifies it against the project-level
  // CAPTCHA secret (Turnstile, configured in the Supabase dashboard).
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const onTurnstile = useCallback((token: string | null) => setTurnstileToken(token), []);
  const router = useRouter();

  function getSignupSource(): string {
    const params = new URLSearchParams(window.location.search);
    return params.get("utm_source") || params.get("ref") || "direct";
  }

  async function handleGoogleSignIn() {
    if (mode === "signup" && !consent) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const signupSource = getSignupSource();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?signup_source=${encodeURIComponent(signupSource)}`,
        // TIM-2246: pass CAPTCHA token when Turnstile is provisioned. Supabase
        // OAuth honors the project-level CAPTCHA setting on the initiate call.
        ...(turnstileToken ? { captchaToken: turnstileToken } : {}),
      },
    });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !consent) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();

    if (mode === "signup") {
      const signupSource = getSignupSource();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { signup_source: signupSource },
          // TIM-2246: Turnstile token forwarded to Supabase Auth when present.
          // Supabase's project-level CAPTCHA setting handles enforcement;
          // pre-provision (token=null) Supabase ignores the field.
          ...(turnstileToken ? { captchaToken: turnstileToken } : {}),
        },
      });
      if (error) {
        setError(error.message);
      } else {
        router.push("/onboarding");
        router.refresh();
      }
    } else {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
        // TIM-2246: also pass CAPTCHA on sign-in to throttle credential-stuffing
        // attempts. Supabase Auth verifies when project-level CAPTCHA is on.
        ...(turnstileToken ? { options: { captchaToken: turnstileToken } } : {}),
      });
      if (error) {
        setError(error.message);
      } else {
        // Check onboarding status before redirecting
        if (data.user) {
          const { data: profile } = await supabase
            .from("users")
            .select("onboarding_completed")
            .eq("id", data.user.id)
            .single();
          if (!profile?.onboarding_completed) {
            router.push("/onboarding");
          } else {
            router.push("/dashboard");
          }
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      }
    }
    setLoading(false);
  }

  const signupBlocked = mode === "signup" && !consent;

  return (
    <div className="space-y-4">
      <button
        onClick={handleGoogleSignIn}
        disabled={loading || signupBlocked}
        className="w-full flex items-center justify-center gap-3 border border-[var(--border)] rounded-xl py-3 text-sm font-medium text-[var(--foreground)] hover:border-[var(--dark-grey)] hover:bg-[var(--background)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="var(--google-blue)"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="var(--google-green)"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="var(--google-yellow)"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="var(--google-red)"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-[var(--dark-grey)]">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span>or</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      <form onSubmit={handleEmailAuth} className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-[var(--foreground)] mb-1">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--dark-grey)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label htmlFor="password" className="block text-xs font-medium text-[var(--foreground)]">Password</label>
            {mode === "signin" && (
              <Link
                href="/forgot-password"
                className="text-xs text-[var(--teal)] hover:underline"
              >
                Forgot Password?
              </Link>
            )}
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            minLength={8}
            className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--dark-grey)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
          />
        </div>

        {mode === "signup" && (
          <label className="flex items-start gap-2 text-xs text-[var(--foreground)] leading-relaxed pt-1">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              required
              aria-required="true"
              className="mt-0.5 h-4 w-4 rounded border-[var(--dark-grey)] text-[var(--teal)] focus:ring-[var(--teal)]"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" rel="noopener" className="text-[var(--teal)] underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" rel="noopener" className="text-[var(--teal)] underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <TurnstileWidget onVerify={onTurnstile} />

        <button
          type="submit"
          disabled={loading || signupBlocked}
          className="w-full bg-[var(--teal)] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Just a moment..." : mode === "signin" ? "Sign In" : "Create Account"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="w-full text-center text-xs text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
      >
        {mode === "signin" ? "New here? Create a free account instead" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
