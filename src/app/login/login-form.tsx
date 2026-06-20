"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { TurnstileWidget } from "@/app/_components/TurnstileWidget";
import {
  REMEMBER_ME_COOKIE,
  REMEMBER_ME_MAX_AGE_SECONDS,
  isSupabaseAuthCookie,
} from "@/lib/auth/remember-me";
import { resolveNext } from "@/lib/safe-next";
import { deleteAllVerifierVariants, verifierPresentInDocumentCookie } from "./clear-stale-verifier";
import { newCorrId } from "@/lib/oauth-diag";

const RESEND_COOLDOWN_SECONDS = 60;

// TIM-2430: read the user's last "Keep me signed in" choice so the checkbox
// reflects whatever they picked last sign-in. Absent cookie = default true,
// which matches the pre-TIM-2430 status quo (Supabase SSR persists for 400d).
function readInitialRememberPreference(): boolean {
  if (typeof document === "undefined") return true;
  const match = document.cookie.split(";").find(c => c.trim().startsWith(`${REMEMBER_ME_COOKIE}=`));
  if (!match) return true;
  const value = decodeURIComponent(match.trim().substring(REMEMBER_ME_COOKIE.length + 1));
  return value !== "0";
}

// TIM-2430: write the preference itself with a long Max-Age so it survives the
// current browser session and pre-fills the checkbox next time the user lands
// on /login (even after they opted out and the auth cookies got cleared).
function writeRememberPreference(remember: boolean) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${REMEMBER_ME_COOKIE}=${remember ? "1" : "0"}; Path=/; Max-Age=${REMEMBER_ME_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

// TIM-2430: @supabase/ssr's browser-side `setItem` hard-codes maxAge to its
// 400-day default and ignores any cookieOptions override (see
// node_modules/@supabase/ssr/dist/main/cookies.js — `setCookieOptions.maxAge`
// is forcibly reset). So when the user unchecks "Keep me signed in", we
// rewrite the freshly-set chunked auth cookies in place WITHOUT Max-Age/
// Expires, turning them into session cookies that clear on browser close.
// Server-side refreshes are kept session-scoped by the proxy + server.ts
// `setAll` adapters reading the same gw_remember_me cookie.
function downgradeAuthCookiesToSessionScope() {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  for (const raw of document.cookie.split(";")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.substring(0, eq);
    if (!isSupabaseAuthCookie(name)) continue;
    const value = trimmed.substring(eq + 1);
    // Re-set with the same value but no Max-Age / Expires attribute.
    document.cookie = `${name}=${value}; Path=/; SameSite=Lax${secure}`;
  }
}

export function LoginForm({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [consent, setConsent] = useState(false);
  // TIM-2430: client-side state defaults to true on the server render so the
  // checkbox SSR pre-fill never flickers off; useEffect below syncs it to the
  // actual stored preference once the component mounts.
  const [rememberMe, setRememberMe] = useState(true);
  // TIM-2246: Turnstile attestation token, passed to Supabase Auth via
  // options.captchaToken. Supabase verifies it against the project-level
  // CAPTCHA secret (Turnstile, configured in the Supabase dashboard).
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const onTurnstile = useCallback((token: string | null) => setTurnstileToken(token), []);
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const router = useRouter();
  // TIM-2750: synchronous re-entry guard for the Google OAuth click handler.
  // `loading` (React state) does NOT disable the button before the next click
  // event drains from the event queue — React batches state updates and the
  // re-render happens after the current macrotask. A rapid double-click fires
  // signInWithOAuth twice; each call generates its own PKCE verifier and its
  // own /authorize challenge. The Supabase /authorize record and the verifier
  // cookie can end up belonging to DIFFERENT round-trips, so exchange fails
  // with `code_challenge_does_not_match_previously_saved_code_verifier` — the
  // exact symptom on TIM-2572/TIM-2750. A ref flag is set synchronously inside
  // the click handler before the first await, so the second click sees it set
  // and returns early. Reproduced via scripts/tim2750-doubleclick.mjs (2
  // /authorize calls with different challenges from one rapid click sequence).
  const googleInFlightRef = useRef(false);

  useEffect(() => {
    setRememberMe(readInitialRememberPreference());
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function getSignupSource(): string {
    const params = new URLSearchParams(window.location.search);
    return params.get("utm_source") || params.get("ref") || "direct";
  }

  // TIM-2730: use the shared allowlist (resolveNext) — same path-only +
  // prefix-allowlist guard used by /auth/callback, src/proxy.ts, and
  // (app)/layout.tsx so every honor-?next= site applies the same open-redirect
  // guard. resolveNext returns null for absolute/protocol-relative URLs or
  // paths outside SAFE_NEXT_PREFIXES.
  function getNextParam(): string | null {
    return resolveNext(new URLSearchParams(window.location.search).get("next"));
  }

  // TIM-2327: hand off signup_source + next via short-lived first-party cookies
  // instead of as query params on `redirectTo`. Supabase Auth's Additional
  // Redirect URLs allowlist is exact-match (wildcards on query strings aren't
  // reliable across regions/versions); with query params the redirect can fail
  // allowlist matching and silently fall back to Site URL, dropping the user
  // on apex (= coming-soon post TIM-2288) with no session. Bare `/auth/callback`
  // is the minimal allowlist surface. Cookies survive the OAuth round-trip
  // because /auth/callback is same-origin with /login.
  function setHandoffCookie(name: string, value: string) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
  }

  // TIM-2327: stale-verifier pre-deletion lives in ./clear-stale-verifier so
  // its cookie-name regex and Path/Domain variant list are unit-tested
  // independently of the React component. Full incident context in that file.

  async function handleGoogleSignIn() {
    // TIM-2750: re-entry guard FIRST, before any await. See ref declaration
    // for full context. Without this, React's setLoading(true) does not
    // disable the button before the next click event drains, and rapid
    // double-clicks fire two concurrent OAuth handshakes that race.
    if (googleInFlightRef.current) return;
    if (mode === "signup" && !consent) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
    googleInFlightRef.current = true;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    setHandoffCookie("gw_oauth_signup_source", getSignupSource());
    const next = getNextParam();
    if (next) setHandoffCookie("gw_oauth_next", next);
    // TIM-2786: mint a correlation id and hand it off so /auth/callback can
    // stitch the pre-nav client beacon, the server callback log row, and the
    // post-bounce /login client beacon into one log group. The id is opaque,
    // short, and contains no PII (see lib/oauth-diag.ts).
    const corrId = newCorrId();
    setHandoffCookie("gw_oauth_corr_id", corrId);
    // TIM-2430: write preference before redirecting to Google; it survives the
    // OAuth round-trip and the proxy+server reads it on /auth/callback.
    writeRememberPreference(rememberMe);
    // TIM-2327: blast every Path/Domain variant of the verifier cookie before
    // signInWithOAuth so supabase-js's new write isn't shadowed by a stale
    // sibling at a different Domain attr. See clear-stale-verifier.ts for the
    // full incident context (board-reported double-login symptom).
    const staleVerifierCount =
      typeof document !== "undefined"
        ? deleteAllVerifierVariants({
            getDocumentCookie: () => document.cookie,
            setDocumentCookie: (line) => {
              document.cookie = line;
            },
            hostname: window.location.hostname,
          })
        : 0;
    // TIM-2750: skipBrowserRedirect lets us inspect document.cookie AFTER
    // @supabase/ssr's setItem has written the verifier and BEFORE we navigate
    // to Supabase /authorize. The sentinel cookie below captures that state,
    // which the /auth/callback route surfaces in the diag string on failure.
    // (auth/callback/route.ts:65 already READS gw_oauth_verifier_pre_nav; we
    // were never writing it. That's why the board's recent diagnostic showed
    // `verifier_pre_nav=` empty.) We then navigate manually via
    // window.location.assign(data.url) — same call supabase-js makes when
    // skipBrowserRedirect is false, just executed by our handler so it can be
    // gated on the in-flight ref above.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        skipBrowserRedirect: true,
        // TIM-2246: pass CAPTCHA token when Turnstile is provisioned. Supabase
        // OAuth honors the project-level CAPTCHA setting on the initiate call.
        ...(turnstileToken ? { captchaToken: turnstileToken } : {}),
      },
    });
    // Sentinel handoffs are written AFTER signInWithOAuth has resolved (so the
    // verifier write has landed in document.cookie) but BEFORE the manual nav,
    // so they're in the jar when /auth/callback runs on the round-trip back.
    setHandoffCookie("gw_oauth_stale_verifiers", String(staleVerifierCount));
    setHandoffCookie(
      "gw_oauth_verifier_pre_nav",
      typeof document !== "undefined" && verifierPresentInDocumentCookie(document.cookie) ? "1" : "0"
    );
    if (error || !data?.url) {
      // Surface the error and release the in-flight guard so the user can
      // retry. On the happy path the navigation that follows tears down this
      // page, so resetting the guard is unnecessary.
      setError(error?.message ?? "Sign-in failed. Please try again.");
      setLoading(false);
      googleInFlightRef.current = false;
      return;
    }
    // TIM-2786: pre-nav beacon. sendBeacon survives the page-unload from
    // window.location.assign(); fetch with keepalive falls back if Beacon API
    // is absent. Captures the verifier-cookie / sb-* state at the EXACT moment
    // we hand control to Google so we can spot Safari ITP / narrow-Path
    // shadowing / refresh-token wipe race conditions that take effect across
    // the Google round-trip. Best-effort: never blocks the redirect.
    try {
      const cookieNames = (typeof document !== "undefined" ? document.cookie : "")
        .split(";")
        .map((c) => c.trim().split("=")[0])
        .filter(Boolean);
      const beacon = {
        event: "pre_nav_intent" as const,
        corrId,
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "absent",
        vw: typeof window !== "undefined" ? window.innerWidth : 0,
        vh: typeof window !== "undefined" ? window.innerHeight : 0,
        cookie_names: cookieNames.slice(0, 80),
        verifier_present: typeof document !== "undefined" && verifierPresentInDocumentCookie(document.cookie),
        stale_verifiers: staleVerifierCount,
        authorize_host: (() => {
          try { return new URL(data.url).host; } catch { return "unparseable"; }
        })(),
        authorize_path: (() => {
          try { return new URL(data.url).pathname; } catch { return "unparseable"; }
        })(),
        third_party_cookie_hint: typeof document !== "undefined" && /Safari/.test(navigator.userAgent) && !/Chrome|Edg/.test(navigator.userAgent) ? "safari_check_itp" : "other",
        next_set: Boolean(next),
      };
      const body = JSON.stringify(beacon);
      const blob = new Blob([body], { type: "application/json" });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/auth-diag", blob);
      } else if (typeof fetch === "function") {
        fetch("/api/auth-diag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Observation must never break the navigation.
    }
    window.location.assign(data.url);
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
    // TIM-2430: record the preference up front so server-side cookie writes
    // during this same response (proxy / route handler) read the right value.
    writeRememberPreference(rememberMe);

    if (mode === "signup") {
      const signupSource = getSignupSource();
      const { error, data } = await supabase.auth.signUp({
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
      } else if (data.session === null) {
        // Email confirmation is required — no session until the user clicks the link
        setEmailConfirmationSent(true);
        setCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        // TIM-2430: Supabase SSR hard-codes 400d maxAge on the freshly-set
        // auth cookies; downgrade them to session-scope if user opted out.
        if (!rememberMe) downgradeAuthCookiesToSessionScope();
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
        // TIM-2430: same downgrade hook as the signup path above.
        if (!rememberMe) downgradeAuthCookiesToSessionScope();
        // TIM-2730: honor ?next= when the visitor was bounced here mid-flight
        // by an expired session (see (app)/layout.tsx). Onboarding still wins
        // if the account isn't onboarded — sending an un-onboarded user into a
        // deep workspace path would render an empty shell. Otherwise the
        // allowlisted next path takes precedence over /dashboard.
        const nextPath = getNextParam();
        if (data.user) {
          const { data: profile } = await supabase
            .from("users")
            .select("onboarding_completed")
            .eq("id", data.user.id)
            .single();
          if (!profile?.onboarding_completed) {
            router.push("/onboarding");
          } else {
            router.push(nextPath ?? "/dashboard");
          }
        } else {
          router.push(nextPath ?? "/dashboard");
        }
        router.refresh();
      }
    }
    setLoading(false);
  }

  async function handleResendConfirmation() {
    if (resendLoading || cooldown > 0) return;
    setResendLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setResendLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }

  if (emailConfirmationSent) {
    return (
      <div className="space-y-4">
        <div className="bg-[var(--teal-bg-pale)] border border-[var(--teal-bg-900)] rounded-xl px-4 py-4 text-sm text-[var(--teal)]">
          We sent a confirmation link to <span className="font-medium">{email}</span>. Open the email and click the link to activate your account.
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        <button
          type="button"
          onClick={handleResendConfirmation}
          disabled={resendLoading || cooldown > 0}
          className="w-full text-center text-xs text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
        >
          {resendLoading ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation email"}
        </button>
      </div>
    );
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

        {/* TIM-2430: matches the consent-checkbox pattern in this same form
            (token-only classes). Sentence-case copy per TIM-1537 Voice rules. */}
        <label className="flex items-start gap-2 text-xs text-[var(--foreground)] leading-relaxed pt-1">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[var(--dark-grey)] text-[var(--teal)] focus:ring-[var(--teal)]"
          />
          <span>Keep me signed in on this device</span>
        </label>

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
