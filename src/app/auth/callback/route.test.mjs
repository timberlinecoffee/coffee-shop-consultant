// TIM-2327: pin SAFE_NEXT_PREFIXES + resolveNext behavior. A regression that
// drops /workspace from the allowlist (or weakens the open-redirect guard)
// would silently re-break Google-OAuth deep links and re-introduce the bug.
// TIM-3148: source-string pins for the no-store cache-control posture so a
// Vercel-edge cached redirect cannot re-introduce the "log in twice" symptom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveNext, SAFE_NEXT_PREFIXES } from "../../../lib/safe-next.ts";

const ROUTE_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "route.ts"),
  "utf8",
);

test("allowlist contains /workspace (TIM-2327)", () => {
  assert.ok(SAFE_NEXT_PREFIXES.includes("/workspace"));
});

test("resolves /workspace deep link", () => {
  assert.equal(resolveNext("/workspace/business-plan"), "/workspace/business-plan");
});

test("resolves /workspace exact match", () => {
  assert.equal(resolveNext("/workspace"), "/workspace");
});

test("resolves /workspace with query string", () => {
  assert.equal(resolveNext("/workspace?tab=overview"), "/workspace?tab=overview");
});

test("resolves /dashboard (existing)", () => {
  assert.equal(resolveNext("/dashboard"), "/dashboard");
});

test("rejects protocol-relative URL (open redirect guard)", () => {
  assert.equal(resolveNext("//evil.tld/x"), null);
});

test("rejects absolute URL", () => {
  assert.equal(resolveNext("https://evil.tld/x"), null);
});

test("rejects path not in allowlist", () => {
  assert.equal(resolveNext("/admin"), null);
});

test("rejects null/empty", () => {
  assert.equal(resolveNext(null), null);
  assert.equal(resolveNext(""), null);
});

test("rejects prefix-confusion attack (/workspaceX)", () => {
  // /workspaceX must NOT match /workspace — the check is exact OR
  // followed by "/" or "?", not a raw startsWith.
  assert.equal(resolveNext("/workspaceX"), null);
});

// TIM-3148 pinning: ensure the route is explicit about not being statically
// cached and that every redirect carries no-store headers. A regression here
// could let Vercel edge cache a 307/308 redirect to `/login?error=auth_failed`,
// reproducing the "log in twice, second time succeeds" symptom for any user
// whose first attempt failed for any reason (stale verifier, network blip,
// supabase 5xx). Source-string pins per the TIM-2327 / TIM-2750 pattern in
// login-form-pinning.test.mjs.

test("TIM-3148: route declares export const dynamic = 'force-dynamic'", () => {
  assert.match(
    ROUTE_SRC,
    /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/,
    "route.ts must opt out of static rendering explicitly",
  );
});

test("TIM-3148: route declares export const revalidate = 0", () => {
  assert.match(
    ROUTE_SRC,
    /export\s+const\s+revalidate\s*=\s*0/,
    "route.ts must declare revalidate=0 so ISR cannot apply",
  );
});

test("TIM-3148: applyNoStore helper sets no-store cache-control", () => {
  assert.match(
    ROUTE_SRC,
    /Cache-Control["'\s,:]+no-store/i,
    "applyNoStore must set Cache-Control: no-store on every redirect",
  );
});

test("TIM-3148: every redirect path goes through applyNoStore wrapper", () => {
  // The route returns redirects exclusively via redirectAndLog → applyNoStore.
  // If a future change introduces a raw NextResponse.redirect() outside the
  // helper, this catches it. Allowed exceptions: the helper's own internal
  // construction (one match for the call site) and any informational comments.
  const lines = ROUTE_SRC.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    if (!trimmed.includes("NextResponse.redirect")) continue;
    assert.ok(
      trimmed.includes("applyNoStore(") || trimmed.includes("clearHandoffCookies("),
      `raw NextResponse.redirect on line is not wrapped by applyNoStore: ${trimmed}`,
    );
  }
});
