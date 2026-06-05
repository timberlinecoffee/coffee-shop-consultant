// TIM-2327: pure helper for the apex (= coming-soon) OAuth interceptor. When
// Supabase's Site URL fallback fires (because `redirectTo` didn't match the
// Additional Redirect URLs allowlist), the browser lands here with the PKCE
// `?code=...` query (or an `?error=...`). buildAuthForwardUrl tells the page
// whether the current request is an auth response that should be forwarded
// to /auth/callback for code-exchange.
//
// Pulled into a dependency-free module so .mjs tests can import without the
// next/navigation + @/ alias headache.

export const AUTH_FORWARD_KEYS = ["code", "state", "error", "error_code", "error_description"] as const;

export function buildAuthForwardUrl(
  params: Record<string, string | string[] | undefined>
): string | null {
  const forward = new URLSearchParams();
  let hasAuthSignal = false;
  for (const key of AUTH_FORWARD_KEYS) {
    const value = params[key];
    if (typeof value !== "string" || value.length === 0) continue;
    forward.set(key, value);
    if (key === "code" || key === "error") hasAuthSignal = true;
  }
  if (!hasAuthSignal) return null;
  return `/auth/callback?${forward.toString()}`;
}
