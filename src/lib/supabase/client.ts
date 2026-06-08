import { createBrowserClient } from '@supabase/ssr'

// TIM-2327 (2026-06-08): explicitly set `secure: true` on auth cookies in
// production. `@supabase/ssr`'s DEFAULT_COOKIE_OPTIONS omit the Secure
// attribute (`{ path:"/", sameSite:"lax", httpOnly:false, maxAge:400d }`).
// Some browsers (notably Safari with ITP, and Chrome's evolving cross-site
// cookie behavior) treat document.cookie-written cookies WITHOUT Secure as
// less-trustworthy when they need to survive a cross-site redirect chain.
// Trent's diagnostic showed verifier_cookies=0 at /auth/callback even though
// signInWithOAuth had written one — i.e. the cookie was set on /login but
// stripped before /auth/callback. Adding Secure brings the verifier cookie
// in line with our own handoff cookies (gw_oauth_*, which DO have Secure
// and survived the round-trip in the same diag with handoff_cookies=2).
// On localhost (dev), window.location.protocol is "http:" so secure=false
// and the cookie still works.
function isHttps(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        secure: isHttps(),
        sameSite: "lax",
        path: "/",
      },
    },
  )
}
