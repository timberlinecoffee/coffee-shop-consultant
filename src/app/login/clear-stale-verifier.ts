// TIM-2327 (2026-06-09): explicitly delete every variant of the PKCE verifier
// cookie BEFORE signInWithOAuth. Lives in its own file so it's testable from
// node:test (which can't resolve the @/ alias when the importer drags in
// @supabase/ssr) and so the regression test can pin the cookie-deletion
// strategy independently of the React component.
//
// Root cause (reproduced via scripts/tim2327-repro.mjs):
// When a stale verifier cookie exists with a different Domain attribute (e.g.
// `Domain=.groundwork.cafe` from a prior signin under different cookie
// attributes), @supabase/ssr's new write at host-only `Domain=groundwork.cafe`
// does NOT overwrite it. Both cookies coexist with the same name. Both are
// sent in the Cookie header to /auth/callback. Next.js cookies().get() reads
// the first one (the stale sibling). exchangeCodeForSession hashes the stale
// verifier, compares to the new code_challenge Supabase recorded — mismatch
// — error: `code_challenge_does_not_match_previously_saved_code_verifier`.
//
// After explicit pre-deletion across all known Path/Domain combos, only the
// fresh verifier survives, its hash matches the challenge, and exchange
// succeeds.

export type CookieEnv = {
  /** Comma-or-semicolon delimited cookie string (e.g. document.cookie). */
  readonly getDocumentCookie: () => string;
  /** Single Set-Cookie write (mirrors `document.cookie = "..."`). */
  readonly setDocumentCookie: (line: string) => void;
  /** Current host, used to compute Domain attribute deletion variants. */
  readonly hostname: string;
};

const VERIFIER_NAME_RE = /^sb-.+-auth-token-code-verifier(\.\d+)?$/;

export function findStaleVerifierNames(documentCookie: string): string[] {
  const names: string[] = [];
  for (const raw of documentCookie.split(";")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.substring(0, eq);
    if (VERIFIER_NAME_RE.test(name)) names.push(name);
  }
  return names;
}

export function pathDomainVariantsForDeletion(hostname: string): string[] {
  const variants = [
    "Path=/",
    `Path=/; Domain=${hostname}`,
    `Path=/; Domain=.${hostname}`,
  ];
  // If the hostname has a subdomain (a.b.c), also blast the eTLD+1 (b.c) in
  // case any past write used the registrable-domain form.
  if (hostname.includes(".")) {
    const eTldPlus1 = hostname.replace(/^[^.]+\./, "");
    if (eTldPlus1 && eTldPlus1 !== hostname) {
      variants.push(`Path=/; Domain=${eTldPlus1}`, `Path=/; Domain=.${eTldPlus1}`);
    }
  }
  return variants;
}

/**
 * Returns the number of distinct verifier-named cookies that were found and
 * for which deletion lines were emitted. Browsers ignore deletions that don't
 * match any cookie, so emitting all variants is harmless on the happy path.
 */
export function deleteAllVerifierVariants(env: CookieEnv): number {
  const names = findStaleVerifierNames(env.getDocumentCookie());
  if (names.length === 0) return 0;
  const variants = pathDomainVariantsForDeletion(env.hostname);
  for (const name of names) {
    for (const v of variants) {
      env.setDocumentCookie(`${name}=; ${v}; Max-Age=0`);
    }
  }
  return names.length;
}

/**
 * TIM-2750: returns true if document.cookie contains at least one
 * verifier-named cookie with a non-empty value. The /auth/callback diag
 * surfaces this as the `verifier_pre_nav` field so a failed exchange can
 * distinguish "@supabase/ssr setItem never wrote" from "browser stripped
 * mid-flight in the OAuth redirect chain". The CALLER is responsible for
 * writing the boolean result to the gw_oauth_verifier_pre_nav handoff cookie
 * — keeping the document.cookie inspection here makes it unit-testable.
 */
export function verifierPresentInDocumentCookie(documentCookie: string): boolean {
  for (const raw of documentCookie.split(";")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.substring(0, eq);
    if (!VERIFIER_NAME_RE.test(name)) continue;
    const value = trimmed.substring(eq + 1);
    if (value.length > 0) return true;
  }
  return false;
}
