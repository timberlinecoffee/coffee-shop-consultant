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

// TIM-2327 (2026-06-25): zombie-cookie purge. Trent's screenshot showed
// `stale_verifiers=400` — the user had accumulated 400 verifier-named cookies
// in document.cookie that prior deletion code could not clear because their
// Path/Domain attributes never matched any of the variants we tried. With
// 400+ cookies for one domain the browser exceeds its per-registrable-domain
// cap (~180 in Chrome) and silently evicts on the next write — including
// supabase-js's fresh verifier — so `verifier_cookies=0` shows at callback
// even though `verifier_pre_nav=1` says the write landed. signOut from
// TIM-2961 acquires the storage lock but only clears the (Name, Path, Domain)
// supabase-ssr knows about; zombies set under historic attributes survive.
//
// purgeAllSupabaseCookies fixes this with two layers:
//   1. Cookie Store API (Chrome 87+, Edge 87+) enumerates each cookie's
//      actual Path/Domain and deletes by exact match — handles any historic
//      attribute combination without guessing.
//   2. document.cookie fallback that blasts a much broader Path × Domain
//      matrix than pathDomainVariantsForDeletion (which only tries Path=/).
//      Covers Firefox / Safari where Cookie Store API is not yet available.
//
// Scope is widened beyond verifier cookies to include auth-token cookies
// too: signOut can leave auth-token zombies for the same reason it leaves
// verifier zombies, and they contribute to the cookie-jar overflow that
// evicts the fresh verifier.

const SB_COOKIE_PREFIX = "sb-";

const PURGE_PATHS = [
  "/",
  "/auth",
  "/auth/callback",
  "/login",
  "/dashboard",
  "/onboarding",
  "/workspace",
] as const;

/**
 * Distinct cookie names (deduped) beginning with `sb-` in a document.cookie
 * string. document.cookie can list the same name multiple times when the
 * browser holds duplicate (Domain, Path) variants visible to the page; we
 * only need each name once because deletion is keyed off the name.
 */
export function findAllSupabaseCookieNames(documentCookie: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of documentCookie.split(";")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.substring(0, eq);
    if (!name.startsWith(SB_COOKIE_PREFIX)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * Path × Domain matrix wider than pathDomainVariantsForDeletion: covers
 * every app-route prefix supabase-ssr could plausibly have used in a prior
 * deploy. Each emitted variant is one half of a `Set-Cookie: name=; ...;
 * Max-Age=0` line. Browsers ignore lines that don't match an existing
 * cookie's exact (Path, Domain) so over-emission is safe.
 */
export function broadPathDomainVariants(hostname: string): string[] {
  const domains: string[] = [
    "", // host-only (no Domain attr)
    `Domain=${hostname}`,
    `Domain=.${hostname}`,
  ];
  // For subdomains (a.b.c), also clear cookies that may have been set on the
  // eTLD+1 parent zone. For 2-part hostnames (groundwork.cafe) there is no
  // parent zone above the registrable domain worth touching, so we skip —
  // unlike pathDomainVariantsForDeletion which incorrectly emitted Domain=cafe
  // (browsers reject public-suffix Domain attributes anyway, so a no-op, but
  // it pollutes the diff).
  const parts = hostname.split(".");
  if (parts.length >= 3) {
    const eTld1 = parts.slice(-2).join(".");
    if (eTld1 && eTld1 !== hostname) {
      domains.push(`Domain=${eTld1}`, `Domain=.${eTld1}`);
    }
  }
  const variants: string[] = [];
  for (const p of PURGE_PATHS) {
    for (const d of domains) {
      variants.push(d ? `Path=${p}; ${d}` : `Path=${p}`);
    }
  }
  return variants;
}

/**
 * document.cookie fallback purge. Iterates every sb-* cookie name visible to
 * the page and writes a Max-Age=0 deletion line for every (Path × Domain)
 * combination in broadPathDomainVariants. Returns the count of distinct
 * cookie names found (NOT the count of deletion lines emitted).
 */
export function purgeAllSupabaseCookiesDom(env: CookieEnv): number {
  const names = findAllSupabaseCookieNames(env.getDocumentCookie());
  if (names.length === 0) return 0;
  const variants = broadPathDomainVariants(env.hostname);
  for (const name of names) {
    for (const v of variants) {
      env.setDocumentCookie(`${name}=; ${v}; Max-Age=0`);
    }
  }
  return names.length;
}

type CookieStoreEntry = {
  readonly name: string;
  readonly value: string;
  readonly path?: string;
  readonly domain?: string | null;
};

type CookieStoreLike = {
  readonly getAll: (opts?: unknown) => Promise<CookieStoreEntry[]>;
  readonly delete: (opts: { name: string; path?: string; domain?: string }) => Promise<void>;
};

export type PurgeResult = {
  /** Count of distinct (name, path, domain) tuples we asked to delete. */
  readonly deleted: number;
  /** Which strategy actually ran — useful for telemetry on the diag. */
  readonly method:
    | "cookie-store-api"
    | "cookie-store-api+dom-fallback"
    | "dom-fallback"
    | "no-window";
};

/**
 * Async purge of every `sb-*` cookie visible to the page. Preferred over the
 * document.cookie-only path because the Cookie Store API exposes each
 * cookie's actual (Path, Domain) attributes — letting us delete the 400-
 * zombie case from Trent's diag (different Path attrs across historic
 * deploys) without guessing.
 *
 * The DOM blast runs after the Cookie Store API path too (belt-and-braces).
 * If the API misses a cookie — observed rarely with cross-origin iframe
 * scenarios — the broad Path × Domain blast catches it.
 *
 * Caller-injectable for unit tests. In prod, pass `defaultPurgeEnv()` (or
 * call `purgeAllSupabaseCookiesDom` directly with the same env when running
 * outside an async context).
 */
export async function purgeAllSupabaseCookies(env: {
  readonly hostname: string;
  readonly getDocumentCookie: () => string;
  readonly setDocumentCookie: (line: string) => void;
  readonly cookieStore: CookieStoreLike | null;
}): Promise<PurgeResult> {
  if (!env.cookieStore) {
    const blasted = purgeAllSupabaseCookiesDom({
      hostname: env.hostname,
      getDocumentCookie: env.getDocumentCookie,
      setDocumentCookie: env.setDocumentCookie,
    });
    return { deleted: blasted, method: "dom-fallback" };
  }
  let apiDeleted = 0;
  try {
    const all = await env.cookieStore.getAll();
    const sb = all.filter((c) => c.name.startsWith(SB_COOKIE_PREFIX));
    for (const c of sb) {
      const opts: { name: string; path?: string; domain?: string } = { name: c.name };
      if (c.path) opts.path = c.path;
      if (c.domain) opts.domain = c.domain;
      try {
        await env.cookieStore.delete(opts);
        apiDeleted += 1;
      } catch {
        // Individual deletes can throw on attribute edge cases (domain="" on
        // some browser versions). Skip and let the DOM fallback try.
      }
    }
  } catch {
    // Full Cookie Store API path failed — fall through to DOM-only.
    const blasted = purgeAllSupabaseCookiesDom({
      hostname: env.hostname,
      getDocumentCookie: env.getDocumentCookie,
      setDocumentCookie: env.setDocumentCookie,
    });
    return { deleted: blasted, method: "dom-fallback" };
  }
  const blasted = purgeAllSupabaseCookiesDom({
    hostname: env.hostname,
    getDocumentCookie: env.getDocumentCookie,
    setDocumentCookie: env.setDocumentCookie,
  });
  return {
    deleted: apiDeleted + blasted,
    method: blasted > 0 ? "cookie-store-api+dom-fallback" : "cookie-store-api",
  };
}

/**
 * Production-side env factory. Reads the global window/cookieStore lazily so
 * importing this module in a server context does not throw.
 */
export function defaultPurgeEnv(): {
  hostname: string;
  getDocumentCookie: () => string;
  setDocumentCookie: (line: string) => void;
  cookieStore: CookieStoreLike | null;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      hostname: "",
      getDocumentCookie: () => "",
      setDocumentCookie: () => {},
      cookieStore: null,
    };
  }
  const cs = (window as unknown as { cookieStore?: CookieStoreLike }).cookieStore;
  return {
    hostname: window.location.hostname,
    getDocumentCookie: () => document.cookie,
    setDocumentCookie: (line: string) => {
      document.cookie = line;
    },
    cookieStore:
      cs && typeof cs.getAll === "function" && typeof cs.delete === "function" ? cs : null,
  };
}
