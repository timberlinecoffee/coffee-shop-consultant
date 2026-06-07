import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  REMEMBER_ME_COOKIE,
  adjustOptionsForRemember,
  parseRememberPreference,
} from '@/lib/auth/remember-me'

export async function createClient() {
  const cookieStore = await cookies()
  // TIM-2430: same preference the middleware reads — keep auth cookies
  // session-scoped when the user opted out of "Keep me signed in".
  const remember = parseRememberPreference(cookieStore.get(REMEMBER_ME_COOKIE)?.value)

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, adjustOptionsForRemember(name, options, remember))
            )
          } catch {
            // Server Component — cookies cannot be set, handled by middleware
          }
        },
      },
    }
  )
}
