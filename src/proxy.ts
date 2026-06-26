import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAuthFlowPath } from './proxy-auth-flow'
import {
  REMEMBER_ME_COOKIE,
  adjustOptionsForRemember,
  parseRememberPreference,
} from './lib/auth/remember-me'
import { UI_REVAMP_OVERRIDE_COOKIE } from './lib/ui-revamp'
import { resolveNext } from './lib/safe-next'
import { buildSessionExpiredLoginUrl } from './lib/session-expired'

// TIM-2730: header names the proxy injects on every passed-through request so
// Server Components (specifically src/app/(app)/layout.tsx) can recover the
// original pathname + query string and preserve them through a session-expiry
// `redirect("/login?next=...")`. Next.js Server Components have no built-in
// access to the request URL, so the proxy hands it across via headers.
const GW_PATHNAME_HEADER = 'x-gw-pathname'
const GW_SEARCH_HEADER = 'x-gw-search'

// TIM-2352: paths where running supabase.auth.getUser() in middleware breaks the
// in-flight OAuth handshake. If a user has a stale refresh token, getUser() →
// _callRefreshToken fails → _removeSession() wipes ALL session keys including
// the PKCE code verifier (sb-{ref}-auth-token-code-verifier — see
// @supabase/auth-js GoTrueClient._removeSession). The /auth/callback route
// then exchangeCodeForSession with no verifier → AuthPKCECodeVerifierMissing
// → redirect to /login?error=auth_failed. Second click works because the
// stale tokens are gone. Symptom: "first Google login fails, second succeeds".
// Apex (= coming-soon) is the Supabase Site URL fallback when redirectTo
// does not match the allowlist. ComingSoonPage forwards ?code/?error to
// /auth/callback, but if proxy runs getUser() here first the verifier is
// wiped before the redirect lands.

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  if (isAuthFlowPath(pathname, searchParams.keys())) {
    return NextResponse.next({ request })
  }

  // TIM-2730: hand the original URL down to Server Components via request
  // headers so (app)/layout.tsx can build `?next=` on a session-expiry bounce.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(GW_PATHNAME_HEADER, pathname)
  requestHeaders.set(GW_SEARCH_HEADER, request.nextUrl.search)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  // TIM-2430: honor the "Keep me signed in on this device" preference. When
  // the user opts out (gw_remember_me=0), strip maxAge/expires from Supabase
  // auth cookies as the server re-issues them, turning them into session
  // cookies that clear on browser close.
  const remember = parseRememberPreference(request.cookies.get(REMEMBER_ME_COOKIE)?.value)

  // TIM-3011: guard against empty env vars (CI without Supabase secrets).
  // createServerClient throws "Invalid URL" when the URL is an empty string,
  // crashing every route with a 500. Degrade gracefully: treat as unauthenticated.
  let user: unknown = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, adjustOptionsForRemember(name, options, remember))
            )
          },
        },
      }
    )
    const { data } = await supabase.auth.getUser()
    user = data.user
  }

  // TIM-2589 / TIM-2598: ?ui=v1 or ?ui=v2 sets a persistent override cookie so
  // SSR branches correctly on first paint without a DB write. Phase 5.0 ships
  // to prod with the flag default false; the board flips themselves into v2 by
  // visiting any app URL with ?ui=v2 once — the cookie then sticks across
  // sessions for 365 days. Ignored on auth flow paths (returned above).
  const uiParam = searchParams.get('ui')
  if (uiParam === 'v1' || uiParam === 'v2') {
    supabaseResponse.cookies.set(UI_REVAMP_OVERRIDE_COOKIE, uiParam, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  // TIM-2580: /plan/1 is the public free-preview module. The page handler
  // renders an empty-state ModuleClient for unauthenticated visitors; allow
  // it through the proxy so it isn't redirected to /login before the page
  // ever runs. Keep this in sync with FREE_PREVIEW_MODULE in src/lib/access.ts.
  // `pathname` is already destructured from request.nextUrl at the top of this function.
  const PLAN_FREE_PREVIEW = /^\/plan\/1(?:\/|$)/
  const protectedPaths = ['/dashboard', '/plan', '/account']
  const isProtected =
    protectedPaths.some(p => pathname.startsWith(p)) && !PLAN_FREE_PREVIEW.test(pathname)

  if (isProtected && !user) {
    // TIM-2730: preserve the original pathname + query as ?next= so post-login
    // returns the visitor to where they were headed (e.g. `/account?ui=v2`
    // bouncing through /login lands back on /account with the v2 lane intact).
    // resolveNext is the same path-only allowlist used by /auth/callback and
    // /login — it rejects absolute URLs and protocol-relative `//evil.tld`.
    // TIM-2732: also append `expired=1` so /login shows a session-expiry
    // banner instead of silently rendering the sign-in form (TIM-2721 symptom).
    const original = `${pathname}${request.nextUrl.search}`
    const safe = resolveNext(original)
    return NextResponse.redirect(new URL(buildSessionExpiredLoginUrl(safe), request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)'],
}
