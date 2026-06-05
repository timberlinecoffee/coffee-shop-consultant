import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAuthFlowPath } from './proxy-auth-flow'

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
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const protectedPaths = ['/dashboard', '/plan', '/account']
  const isProtected = protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)'],
}
