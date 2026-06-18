// TIM-2327 / TIM-2730: pure helpers for the `?next=` allowlist used by the
// OAuth callback, the auth proxy, the (app)/ layout's session-expiry redirect,
// and the /login form's post-success redirect. Kept in a dependency-free
// module so .mjs tests (which can't resolve the @/ alias) can import this
// directly without dragging in @supabase/ssr.

export const SAFE_NEXT_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/plan",
  "/account",
  "/reset-password",
  "/workspace",
];

export function resolveNext(rawNext: string | null): string | null {
  if (!rawNext) return null;
  if (!rawNext.startsWith("/")) return null;
  if (rawNext.startsWith("//")) return null;
  return SAFE_NEXT_PREFIXES.some(
    prefix => rawNext === prefix || rawNext.startsWith(`${prefix}/`) || rawNext.startsWith(`${prefix}?`)
  )
    ? rawNext
    : null;
}
