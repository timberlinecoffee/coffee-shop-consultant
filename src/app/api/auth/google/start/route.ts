import { createClient } from "@/lib/supabase/server";
import { logOAuthDiag } from "@/lib/oauth-diag";
import { enforceRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";

// TIM-3339 (2026-06-27): server-side OAuth initiation.
//
// Symptom captured on TIM-3336 (diag deploy d459420):
//   stage=exchange_failed | err_name=AuthPKCECodeVerifierMissingError
//   verifier_cookies=0 | verifier_chunks=0 | verifier_pre_nav=absent
//
// Hypothesis: with @supabase/ssr's `createBrowserClient`, the verifier was
// being written to `document.cookie` from a client component just before
// `window.location.assign(...)`. Cookie commits via `document.cookie =` are
// not synchronously durable across the page-unload that follows; in a small
// but persistent fraction of attempts the cookie never appears on the next
// request to `/auth/callback`. The diag shows the sentinel
// `gw_oauth_verifier_pre_nav` cookie was itself missing too — strong evidence
// the client-side write never landed before the browser tore the page down.
//
// Fix: move the OAuth initiation server-side. `signInWithOAuth` runs inside a
// route handler with `createServerClient` from @supabase/ssr — the cookie
// adapter writes the verifier via `cookieStore.set`, which Next.js attaches
// as `Set-Cookie` headers on the JSON response. The browser commits those
// headers before any JavaScript on the page reads `data.url`, so by the time
// the client does `window.location.assign(...)` the verifier is guaranteed
// to be in the cookie jar.
//
// Acceptance: the response from this route MUST carry
// `Set-Cookie: sb-…-auth-token-code-verifier=…` (asserted by
// route.test.mjs). Prod diag should report
// `verifier_pre_nav=present` on ≥95% of `callback_entry` events post-deploy.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  // Turnstile attestation token forwarded to Supabase Auth when CAPTCHA is on.
  captchaToken: z.string().min(1).max(2048).nullable().optional(),
  // Absolute redirect URL we want Google to bounce back to on success. We
  // accept it from the client so the origin matches whatever vercel.app /
  // preview alias the user is on; the server validates same-origin below.
  redirectTo: z.string().url().max(2048),
});

export async function POST(request: Request) {
  // Rule 4: rate-limit per IP. Anonymous (pre-auth) so we use the forwarded
  // address; Supabase Auth itself also throttles upstream, but the local cap
  // bounds the cost of a credential-stuffing-shaped pattern hitting our route.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anon";
  const limited = await enforceRateLimit({
    bucket: "auth_oauth_start",
    id: ip,
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;

  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Reject open-redirect: redirectTo must point at our own origin's
  // /auth/callback. Same-origin check pinned to the request URL so it works
  // for prod (groundwork.cafe), Vercel preview aliases, and localhost dev.
  let redirectTo: URL;
  try {
    redirectTo = new URL(body.redirectTo);
  } catch {
    return NextResponse.json(
      { error: "Invalid redirectTo." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const reqUrl = new URL(request.url);
  if (redirectTo.origin !== reqUrl.origin || redirectTo.pathname !== "/auth/callback") {
    return NextResponse.json(
      { error: "Invalid redirectTo." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = await createClient();
  // `skipBrowserRedirect: true` returns `{ url }` so we can serialize it as
  // JSON for the client to navigate. The verifier write happens BEFORE
  // `signInWithOAuth` resolves (the auth-js client persists the verifier via
  // the configured storage, which on our `createServerClient` is the Next.js
  // cookie store → emits Set-Cookie on this very response).
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.toString(),
      skipBrowserRedirect: true,
      ...(body.captchaToken ? { captchaToken: body.captchaToken } : {}),
    },
  });

  if (error || !data?.url) {
    logOAuthDiag("client_beacon", {
      stage: "oauth_start_fail",
      err: error?.message?.slice(0, 200),
      err_name: (error as { name?: string } | undefined)?.name,
    });
    return NextResponse.json(
      { error: error?.message ?? "Sign-in failed. Please try again." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { url: data.url },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      },
    },
  );
}
