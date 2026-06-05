// TIM-2327: pure helpers for the OAuth callback's `?next=` allowlist. Kept in
// a dependency-free module so .mjs tests (which can't resolve the @/ alias)
// can import this directly without dragging in @supabase/ssr.

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
