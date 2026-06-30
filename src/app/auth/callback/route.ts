import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveNext } from "@/lib/safe-next";
import {
  browserHintFromUA,
  cookieShape,
  logOAuthDiag,
  newCorrId,
  tail4,
} from "@/lib/oauth-diag";
// TIM-3449: CASL s.10(3) marketing consent capture for Google OAuth signups.
import {
  subscribeToWaitlist,
  setKlaviyoSubscribed,
} from "@/lib/waitlist/klaviyo-subscribe";
import { writeConsentRecord } from "@/lib/waitlist/consent-log";

// TIM-3148 (2026-06-26): explicit dynamic + zero-revalidate so the route is
// never edge-cached. Reading `cookies()` already opts out of static rendering
// in Next.js 15, but being explicit is belt-and-suspenders and removes any
// ambiguity if the platform changes its auto-detection. The bigger win is the
// `Cache-Control: no-store` we set on every redirect response below — Vercel
// edge can otherwise cache 307/308 redirects, and a cached error redirect
// (`/login?error=auth_failed`) would force the user to retry the OAuth round-
// trip a second time even after the underlying state cleared. That matches
// the "log in twice, second succeeds" symptom in the user-authored debugging
// directive on this issue.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// TIM-2327: short-lived first-party handoff cookies set by /login before
// signInWithOAuth. Lets us strip query params off `redirectTo` so it matches
// Supabase's Additional Redirect URLs allowlist exactly (bare `/auth/callback`),
// avoiding the Site URL fallback that drops users on apex coming-soon.
// TIM-2786 adds gw_oauth_corr_id to thread one login attempt across the
// pre-nav client beacon, this callback, and the bounced /login page.
const HANDOFF_COOKIES = [
  "gw_oauth_signup_source",
  "gw_oauth_next",
  "gw_oauth_verifier_pre_nav",
  "gw_oauth_stale_verifiers",
  "gw_oauth_corr_id",
  // TIM-2327 (2026-06-25): zombie-cookie purge telemetry. See login-form.tsx.
  "gw_oauth_purge_method",
  "gw_oauth_purge_total",
  // TIM-3449: CASL s.10(3) marketing consent passed through OAuth round-trip.
  "gw_oauth_marketing_consent",
] as const;

function clearHandoffCookies(res: NextResponse) {
  for (const name of HANDOFF_COOKIES) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}

// TIM-3148 (2026-06-26): every redirect response from this route must be
// uncacheable — by the browser, by Vercel edge, and by any intermediate CDN.
// A cached 307/308 redirect on `/auth/callback?code=…` would force the user
// to walk the OAuth round-trip a second time. Set on every response we hand
// back so the no-store guarantee never depends on a caller remembering to
// add it.
function applyNoStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  return res;
}

// TIM-2327 (2026-06-07): emit a structured diagnostic on the /login?error= URL
// so we can capture the exact failure mode from a single user retry. Without
// Vercel runtime log access and with no Sentry DSN provisioned (TIM-2301), the
// redirect query string IS the diagnostic channel. /login/page.tsx renders
// `?diag=` verbatim so the user can copy-paste or screenshot. Strip after
// debugging.
function buildDiag(parts: Record<string, string | number | boolean | null | undefined>): string {
  const segments: string[] = [];
  for (const [k, v] of Object.entries(parts)) {
    if (v === undefined || v === null) continue;
    // sb_names can list multiple cookie names — give it more room than other
    // fields which are short error / count values.
    const cap = k === "sb_names" ? 240 : 80;
    segments.push(`${k}=${String(v).replace(/[\s&=]/g, "_").slice(0, cap)}`);
  }
  return segments.join("|");
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const cookieStore = await cookies();

  // TIM-2786: correlation id threads pre-nav client beacon → this callback →
  // bounced /login client beacon. Reuse the handoff cookie if present so the
  // pre-nav row matches this server row; otherwise mint a fresh one so this
  // attempt still gets its own group key in Vercel logs.
  const corrId = cookieStore.get("gw_oauth_corr_id")?.value || newCorrId();

  // Probe the verifier cookie presence (NOT its value — that's secret). The
  // verifier name pattern is `sb-<ref>-auth-token-code-verifier`. Also count
  // chunked variants (e.g. `-code-verifier.0`) in case @supabase/ssr split
  // the value, plus list ALL sb-* cookie names for ground-truth diagnosis.
  const allCookies = cookieStore.getAll();
  const verifierCookies = allCookies.filter(c =>
    c.name.startsWith("sb-") && c.name.endsWith("-auth-token-code-verifier")
  );
  const verifierChunked = allCookies.filter(c =>
    c.name.startsWith("sb-") && /-auth-token-code-verifier\.\d+$/.test(c.name)
  );
  const authTokenCookies = allCookies.filter(c =>
    c.name.startsWith("sb-") && c.name.includes("-auth-token") && !c.name.endsWith("-code-verifier") && !/-code-verifier\.\d+$/.test(c.name)
  );
  const sbNames = allCookies.filter(c => c.name.startsWith("sb-")).map(c => c.name).join(",");
  const handoffPresent = allCookies.filter(c => HANDOFF_COOKIES.includes(c.name as typeof HANDOFF_COOKIES[number])).length;
  const rememberMeRaw = cookieStore.get("gw_remember_me")?.value;
  // TIM-2327 (2026-06-08): sentinel from login-form recording whether the
  // verifier cookie was present in document.cookie at the moment of OAuth
  // navigation. "1" = setItem wrote it (so loss is mid-flight in the redirect
  // chain). "0" = setItem failed to write at all. "absent" = sentinel never
  // set (user on an old deploy, or some upstream error).
  const verifierPreNav = cookieStore.get("gw_oauth_verifier_pre_nav")?.value;
  // TIM-2327 (2026-06-09): count of stale verifier-name cookies that
  // login-form's deleteAllVerifierVariants() found and deleted before calling
  // signInWithOAuth. Non-zero on a successful exchange means the pre-delete
  // was load-bearing for the user (a stale sibling at a different Path/Domain
  // would have shadowed the fresh write and broken the round-trip).
  const staleVerifiers = cookieStore.get("gw_oauth_stale_verifiers")?.value;
  // TIM-2327 (2026-06-25): purge telemetry from login-form. method tells us
  // whether Cookie Store API ran (= cookies deleted by exact attribute) or
  // we fell back to the document.cookie blast (= attribute-guessing). total
  // is the count of cookies the purge asked to clear. On the next failure
  // diag, `purge_method=cookie-store-api*` + `verifier_cookies=0` rules out
  // the zombie-overflow hypothesis and points us at a different root cause.
  const purgeMethod = cookieStore.get("gw_oauth_purge_method")?.value;
  const purgeTotal = cookieStore.get("gw_oauth_purge_total")?.value;
  const userAgent = request.headers.get("user-agent") ?? "";
  const browserHint = browserHintFromUA(userAgent);
  // TIM-3327: capture the host this callback is running on AND the Referer
  // host the browser was sent from. A mismatch (e.g. /login on
  // www.groundwork.cafe → Supabase fallback lands user on apex
  // groundwork.cafe → coming-soon forwarder redirects here on apex) explains
  // verifier_pre_nav=absent + verifier_cookies=0 + auth_token_cookies>0:
  // host-only cookies set under www are invisible on apex even though prior
  // apex sessions left their own auth-token chunks behind. This single log
  // pair lets the next failed attempt rule the hypothesis in or out.
  const hostHeader = request.headers.get("host") ?? "absent";
  const refererHostHeader = (() => {
    const r = request.headers.get("referer");
    if (!r) return "absent";
    try { return new URL(r).host; } catch { return "unparseable"; }
  })();

  // Prefer the cookie handoff (OAuth path); fall back to query param for the
  // email-link confirmation flow which still uses `?next=` on emailRedirectTo.
  const next = resolveNext(
    cookieStore.get("gw_oauth_next")?.value ?? searchParams.get("next")
  );

  // TIM-2786: structured diag at handler entry. The full URL bar (with
  // code/state truncated to last 4 chars), every Supabase + handoff cookie
  // (name + length, NEVER value), the resolved `next` allowlist outcome,
  // and the redirect chain headers (Referer + sec-fetch hints) so we can
  // tell a clean magic-link callback from a stale-cookie bounce. Default-on.
  logOAuthDiag("callback_entry", {
    corrId,
    url: `${requestUrl.pathname}${requestUrl.search ? "?" + [...searchParams.entries()].map(([k, v]) => k === "code" || k === "state" ? `${k}=${tail4(v)}` : `${k}=${v.slice(0, 64)}`).join("&") : ""}`,
    has_code: code !== null,
    code_tail: tail4(code),
    state_tail: tail4(searchParams.get("state")),
    error_param: errorParam ?? "absent",
    error_desc: searchParams.get("error_description")?.slice(0, 120) ?? "absent",
    verifier_cookies: verifierCookies.length,
    verifier_chunks: verifierChunked.length,
    verifier_pre_nav: verifierPreNav ?? "absent",
    stale_verifiers: staleVerifiers ?? "absent",
    purge_method: purgeMethod ?? "absent",
    purge_total: purgeTotal ?? "absent",
    auth_token_cookies: authTokenCookies.length,
    handoff_cookies: handoffPresent,
    remember_me: rememberMeRaw ?? "absent",
    browser: browserHint,
    next_resolved: next ?? "none",
    next_raw_cookie: tail4(cookieStore.get("gw_oauth_next")?.value),
    referer: request.headers.get("referer")?.slice(0, 200) ?? "absent",
    sec_fetch_site: request.headers.get("sec-fetch-site") ?? "absent",
    sec_fetch_mode: request.headers.get("sec-fetch-mode") ?? "absent",
    sec_fetch_dest: request.headers.get("sec-fetch-dest") ?? "absent",
    sb_cookie_shape: cookieShape(allCookies.filter((c) => c.name.startsWith("sb-"))),
    all_cookie_names: allCookies.map((c) => c.name).slice(0, 60),
    // TIM-3327: see hostHeader/refererHostHeader declarations for context.
    host: hostHeader,
    referer_host: refererHostHeader,
  });

  // TIM-2786 helper: build a redirect, log the Location header for the
  // diag stream (NEVER the full code/state), and clear handoff cookies.
  function redirectAndLog(path: string, stage: string, extra: Record<string, unknown> = {}) {
    const targetUrl = path.startsWith("http") ? path : `${origin}${path}`;
    const sanitized = (() => {
      try {
        const u = new URL(targetUrl);
        const params = new URLSearchParams();
        for (const [k, v] of u.searchParams.entries()) {
          params.set(k, k === "diag" ? `len=${v.length}` : v.slice(0, 80));
        }
        return `${u.pathname}${params.size > 0 ? "?" + params.toString() : ""}`;
      } catch {
        return "unparseable";
      }
    })();
    logOAuthDiag("callback_redirect", {
      corrId,
      stage,
      location: sanitized,
      ...extra,
    });
    return applyNoStore(clearHandoffCookies(NextResponse.redirect(targetUrl)));
  }

  if (code) {
    const supabase = await createClient();
    // TIM-3327: re-read cookies immediately before exchange so we can tell
    // "verifier was never present at the callback origin" from "verifier was
    // present at handler entry but cleared between entry and exchange". The
    // delta should always be zero — if it isn't, supabase-js's server-side
    // init is touching the verifier slot before exchangeCodeForSession runs.
    const preExchangeCookies = (await cookies()).getAll();
    const preExchangeVerifierCount = preExchangeCookies.filter(c =>
      c.name.startsWith("sb-") && c.name.endsWith("-auth-token-code-verifier")
    ).length;
    const preExchangeVerifierChunks = preExchangeCookies.filter(c =>
      c.name.startsWith("sb-") && /-auth-token-code-verifier\.\d+$/.test(c.name)
    ).length;
    logOAuthDiag("callback_pre_exchange", {
      corrId,
      browser: browserHint,
      host: hostHeader,
      verifier_cookies_entry: verifierCookies.length,
      verifier_chunks_entry: verifierChunked.length,
      verifier_cookies_pre_exchange: preExchangeVerifierCount,
      verifier_chunks_pre_exchange: preExchangeVerifierChunks,
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      logOAuthDiag("callback_exchange_ok", { corrId, browser: browserHint });
      const { data: { user } } = await supabase.auth.getUser();

      if (next) {
        return redirectAndLog(next, "exchange_ok_next", { next_resolved: next });
      }

      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("onboarding_completed, signup_source")
          .eq("id", user.id)
          .single();

        // Capture signup_source for OAuth users (trigger fires before we have UTM data)
        if (profile && !profile.signup_source) {
          const signupSource =
            cookieStore.get("gw_oauth_signup_source")?.value ||
            searchParams.get("signup_source") ||
            "direct";
          await supabase.from("users").update({ signup_source: signupSource }).eq("id", user.id);
        }

        // TIM-3449: CASL s.10(3) marketing consent for new Google OAuth signups.
        // Only record on first-time signups (onboarding_completed=false). The
        // gw_oauth_marketing_consent handoff cookie is "1" if the user ticked the
        // checkbox in login-form.tsx before the OAuth redirect, "0" otherwise.
        if (user?.email && !profile?.onboarding_completed) {
          const oauthMarketingConsent =
            cookieStore.get("gw_oauth_marketing_consent")?.value === "1";
          const consentedAt = new Date();
          let klaviyoProfileId: string | null = null;
          let klaviyoSubscribed: boolean | null = null;
          if (oauthMarketingConsent) {
            const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
            if (apiKey) {
              const sub = await subscribeToWaitlist(apiKey, user.email, "groundwork-ai-signup");
              if (sub.ok) {
                klaviyoProfileId = sub.profileId;
                const sr = await setKlaviyoSubscribed(
                  apiKey,
                  user.email,
                  sub.profileId,
                  consentedAt.toISOString(),
                );
                klaviyoSubscribed = sr.ok;
              }
            }
          }
          await writeConsentRecord({
            email: user.email,
            consentType: "express",
            consentSource: "signup_form",
            marketingOptedIn: oauthMarketingConsent,
            klaviyoSubscribed,
            klaviyoProfileId,
            consentedAt,
          });
        }

        if (!profile?.onboarding_completed) {
          return redirectAndLog("/onboarding", "exchange_ok_onboarding");
        }
      }
      return redirectAndLog("/dashboard", "exchange_ok_dashboard");
    }

    logOAuthDiag("callback_exchange_fail", {
      corrId,
      err: error.message?.slice(0, 200),
      err_status: (error as { status?: number }).status,
      err_name: (error as { name?: string }).name,
      verifier_cookies: verifierCookies.length,
      verifier_chunks: verifierChunked.length,
      verifier_pre_nav: verifierPreNav ?? "absent",
      stale_verifiers: staleVerifiers ?? "absent",
      purge_method: purgeMethod ?? "absent",
      purge_total: purgeTotal ?? "absent",
      auth_token_cookies: authTokenCookies.length,
      handoff_cookies: handoffPresent,
      browser: browserHint,
      sb_names: sbNames,
    });
    const diag = buildDiag({
      stage: "exchange_failed",
      err: error.message,
      err_status: (error as { status?: number }).status,
      err_name: (error as { name?: string }).name,
      verifier_cookies: verifierCookies.length,
      verifier_chunks: verifierChunked.length,
      verifier_pre_nav: verifierPreNav ?? "absent",
      stale_verifiers: staleVerifiers ?? "absent",
      purge_method: purgeMethod ?? "absent",
      purge_total: purgeTotal ?? "absent",
      auth_token_cookies: authTokenCookies.length,
      handoff_cookies: handoffPresent,
      remember_me: rememberMeRaw ?? "absent",
      browser: browserHint,
      sb_names: sbNames,
    });
    // TIM-2786: include `corr=` so the client beacon on /login can stitch
    // back to the same corrId without reading any cookie value.
    return redirectAndLog(
      `/login?error=auth_failed&corr=${encodeURIComponent(corrId)}&diag=${encodeURIComponent(diag)}`,
      "exchange_failed",
    );
  }

  logOAuthDiag("callback_no_code", {
    corrId,
    error_param: errorParam ?? "absent",
    search_keys: [...searchParams.keys()].join(","),
  });
  const diag = buildDiag({
    stage: errorParam ? "supabase_error_param" : "no_code",
    err: errorParam ?? undefined,
    err_desc: searchParams.get("error_description") ?? undefined,
    verifier_cookies: verifierCookies.length,
    verifier_chunks: verifierChunked.length,
    verifier_pre_nav: verifierPreNav ?? "absent",
    auth_token_cookies: authTokenCookies.length,
    handoff_cookies: handoffPresent,
    remember_me: rememberMeRaw ?? "absent",
    browser: browserHint,
    sb_names: sbNames,
    search_keys: [...searchParams.keys()].join(","),
  });
  return redirectAndLog(
    `/login?error=auth_failed&corr=${encodeURIComponent(corrId)}&diag=${encodeURIComponent(diag)}`,
    errorParam ? "supabase_error_param" : "no_code",
  );
}
