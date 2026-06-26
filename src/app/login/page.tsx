import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { Logo } from "../_components/Logo";
import {
  SessionExpiredBanner,
  isSessionExpiredFlag,
} from "../_components/SessionExpiredBanner";
import { OAuthDiagBeacon } from "../_components/OAuthDiagBeacon";
import { createClient } from "@/lib/supabase/server";
import { resolveNext } from "@/lib/safe-next";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Sign In | My Coffee Shop Consultant",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; error?: string; diag?: string; expired?: string; corr?: string }>;
}) {
  const { mode, next, error, diag, expired, corr } = await searchParams;
  const initialMode = mode === "signup" ? "signup" : "signin";
  const isSignup = initialMode === "signup";
  // TIM-2732: surface a session-expiry banner when the (app) layout or proxy
  // bounced the visitor here with `?expired=1`. Signed-in users redirect away
  // before reaching the render path so the banner only appears for the actual
  // post-bounce frame.
  const sessionExpired = isSessionExpiredFlag(expired) && !isSignup;

  // TIM-2352: if the visitor is already authenticated, bounce them straight to
  // their next destination so revisiting /login does not look like a re-login
  // prompt. Skip the bounce when ?error= is present — they came here because
  // an auth flow failed and the error message belongs in front of them.
  if (!error) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // TIM-2730: use the shared allowlist (resolveNext) — same path-only +
        // prefix-allowlist guard used by /auth/callback and (app)/layout.tsx so
        // the open-redirect check is identical across every honor-?next= site.
        const safeNext = resolveNext(typeof next === "string" ? next : null);
        redirect(safeNext ?? "/dashboard");
      }
    } catch {
      // Supabase unavailable (e.g. CI without credentials) — fall through to login form
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center mb-10" aria-label="Groundwork home">
        <Logo variant="color" height={48} priority />
      </Link>

      <div className="bg-white rounded-2xl border border-[var(--border)] p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2 text-center">
          {isSignup ? "Create your account" : "Welcome Back"}
        </h1>
        <p className="text-[var(--dark-grey)] text-sm text-center mb-8">
          {isSignup ? "Start your coffee shop journey for free" : "Sign in to your coffee shop plan"}
        </p>
        {sessionExpired && <SessionExpiredBanner className="mb-4" />}
        {/* TIM-2786: client beacon — fires only when ?error= is present, so
            visitors arriving at /login from a link or footer never trigger it. */}
        <OAuthDiagBeacon
          corrId={typeof corr === "string" && corr.length > 0 ? corr : null}
          errorParam={typeof error === "string" && error.length > 0 ? error : null}
          diagLen={typeof diag === "string" ? diag.length : 0}
          diagHead={typeof diag === "string" ? diag.slice(0, 200) : ""}
        />
        {error === "auth_failed" && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <p className="font-medium mb-1">Sign-in didn&apos;t complete. Please try again.</p>
            {typeof diag === "string" && diag.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-red-600 font-medium select-none">Diagnostic detail (TIM-2327)</summary>
                <code className="block mt-1 text-[10px] break-all text-red-800 font-mono">{diag}</code>
              </details>
            )}
          </div>
        )}
        <LoginForm initialMode={initialMode} />
        <p className="text-center text-sm text-[var(--dark-grey)] mt-6">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-[var(--teal)] font-medium hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <Link href="/login?mode=signup" className="text-[var(--teal)] font-medium hover:underline">
                Start for Free
              </Link>
            </>
          )}
        </p>
      </div>

      <p className="text-xs text-[var(--dark-grey)] mt-8 text-center max-w-xs">
        By continuing, you agree to our{" "}
        <Link href="/terms" className="underline hover:text-[var(--teal)]">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-[var(--teal)]">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
