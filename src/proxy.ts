import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAuthFlowPath } from './proxy-auth-flow'
import {
  REMEMBER_ME_COOKIE,
  adjustOptionsForRemember,
  parseRememberPreference,
} from './lib/auth/remember-me'
import { UI_REVAMP_OVERRIDE_COOKIE, UI_REVAMP_COOKIE } from './lib/ui-revamp'

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

  let supabaseResponse = NextResponse.next({ request })

  // TIM-2430: honor the "Keep me signed in on this device" preference. When
  // the user opts out (gw_remember_me=0), strip maxAge/expires from Supabase
  // auth cookies as the server re-issues them, turning them into session
  // cookies that clear on browser close.
  const remember = parseRememberPreference(request.cookies.get(REMEMBER_ME_COOKIE)?.value)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, adjustOptionsForRemember(name, options, remember))
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // TIM-2589: ?ui=v1 or ?ui=v2 sets a session-level override cookie so SSR
  // branches correctly on the first paint without a DB write. The cookie
  // clears when the browser closes (no maxAge). Ignored on auth flow paths
  // (already returned above).
  const uiParam = searchParams.get('ui')
  if (uiParam === 'v1' || uiParam === 'v2') {
    supabaseResponse.cookies.set(UI_REVAMP_OVERRIDE_COOKIE, uiParam, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      // No maxAge = session cookie; cleared on browser close.
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
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // TIM-2595: Deep-link redirects for the 6 standalone workspace routes
  // that are consolidated into the Build workspace in ui_revamp_v2.
  // Only redirects for authenticated users when v2 mode is active.
  // The ?ui= param was already processed into a cookie above, so read
  // both the incoming cookies and the freshly-set override to resolve
  // the effective flag without a DB round-trip.
  if (user) {
    const BUILD_ROUTES: Record<string, string> = {
      '/workspace/location-lease': 'location',
      '/workspace/buildout-equipment': 'equipment',
      '/workspace/suppliers': 'suppliers',
      '/workspace/menu-pricing': 'menu',
      '/workspace/hiring': 'hiring',
      '/workspace/launch-plan': 'launch-plan',
    }

    let buildTab: string | null = null
    for (const [prefix, tab] of Object.entries(BUILD_ROUTES)) {
      if (pathname === prefix || pathname.startsWith(prefix + '/')) {
        buildTab = tab
        break
      }
    }

    if (buildTab !== null) {
      // Resolve v2 flag: newly-set override cookie wins, then request cookie.
      const overrideNew = supabaseResponse.cookies.get(UI_REVAMP_OVERRIDE_COOKIE)?.value
      const overrideOld = request.cookies.get(UI_REVAMP_OVERRIDE_COOKIE)?.value
      const override = overrideNew ?? overrideOld
      const mirror = request.cookies.get(UI_REVAMP_COOKIE)?.value

      const isV2 =
        override === 'v2' ? true
        : override === 'v1' ? false
        : mirror === '1' ? true
        : mirror === '0' ? false
        : true // DB default is v2=true

      if (isV2) {
        const url = request.nextUrl.clone()
        url.pathname = '/workspace/build'
        url.search = ''
        url.searchParams.set('tab', buildTab)
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)'],
}
