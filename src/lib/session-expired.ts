// TIM-2732: shared constants + reader for the `?expired=1` flag that
// (app)/layout.tsx and src/proxy.ts append to /login (and to /landing for
// future entry paths) when an unauthenticated visitor is bounced off a
// protected path. Kept in a dependency-free module so .mjs pin tests (which
// can't resolve the @/ alias or parse JSX) can import this directly.

export const SESSION_EXPIRED_QUERY_PARAM = "expired";
export const SESSION_EXPIRED_QUERY_VALUE = "1";

export function isSessionExpiredFlag(value: string | string[] | undefined): boolean {
  if (typeof value === "string") return value === SESSION_EXPIRED_QUERY_VALUE;
  if (Array.isArray(value)) return value.includes(SESSION_EXPIRED_QUERY_VALUE);
  return false;
}

// TIM-2732: single source of truth for the post-bounce /login URL. Used by
// src/proxy.ts (NextResponse.redirect) and src/app/(app)/layout.tsx
// (Next's server-side redirect). Keeps the `?next=` (TIM-2730) + `&expired=1`
// query shape in one place so a future refactor can't silently drop the
// banner signal at one of the two sites.
export function buildSessionExpiredLoginUrl(safeNext: string | null): string {
  const params = new URLSearchParams();
  if (safeNext) params.set("next", safeNext);
  params.set(SESSION_EXPIRED_QUERY_PARAM, SESSION_EXPIRED_QUERY_VALUE);
  return `/login?${params.toString()}`;
}
