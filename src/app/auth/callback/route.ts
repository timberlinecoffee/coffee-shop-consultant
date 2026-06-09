import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveNext } from "./safe-next";

// TIM-2327: short-lived first-party handoff cookies set by /login before
// signInWithOAuth. Lets us strip query params off `redirectTo` so it matches
// Supabase's Additional Redirect URLs allowlist exactly (bare `/auth/callback`),
// avoiding the Site URL fallback that drops users on apex coming-soon.
const HANDOFF_COOKIES = ["gw_oauth_signup_source", "gw_oauth_next", "gw_oauth_verifier_pre_nav", "gw_oauth_stale_verifiers"] as const;

function clearHandoffCookies(res: NextResponse) {
  for (const name of HANDOFF_COOKIES) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
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
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const cookieStore = await cookies();

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
  const userAgent = request.headers.get("user-agent") ?? "";
  const browserHint = /Firefox\//.test(userAgent)
    ? "firefox"
    : /Edg\//.test(userAgent)
    ? "edge"
    : /Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)
    ? "chrome"
    : /Safari\//.test(userAgent)
    ? "safari"
    : "other";

  // Prefer the cookie handoff (OAuth path); fall back to query param for the
  // email-link confirmation flow which still uses `?next=` on emailRedirectTo.
  const next = resolveNext(
    cookieStore.get("gw_oauth_next")?.value ?? searchParams.get("next")
  );

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (next) {
        return clearHandoffCookies(NextResponse.redirect(`${origin}${next}`));
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

        if (!profile?.onboarding_completed) {
          return clearHandoffCookies(NextResponse.redirect(`${origin}/onboarding`));
        }
      }
      return clearHandoffCookies(NextResponse.redirect(`${origin}/dashboard`));
    }

    const diag = buildDiag({
      stage: "exchange_failed",
      err: error.message,
      err_status: (error as { status?: number }).status,
      err_name: (error as { name?: string }).name,
      verifier_cookies: verifierCookies.length,
      verifier_chunks: verifierChunked.length,
      verifier_pre_nav: verifierPreNav ?? "absent",
      stale_verifiers: staleVerifiers ?? "absent",
      auth_token_cookies: authTokenCookies.length,
      handoff_cookies: handoffPresent,
      remember_me: rememberMeRaw ?? "absent",
      browser: browserHint,
      sb_names: sbNames,
    });
    return clearHandoffCookies(
      NextResponse.redirect(`${origin}/login?error=auth_failed&diag=${encodeURIComponent(diag)}`)
    );
  }

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
  return clearHandoffCookies(
    NextResponse.redirect(`${origin}/login?error=auth_failed&diag=${encodeURIComponent(diag)}`)
  );
}
