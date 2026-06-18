// TIM-2730: pin the open-redirect guard contract for the shared `?next=`
// allowlist now used by /auth/callback (TIM-2327), src/proxy.ts, the
// (app)/layout.tsx session-expiry redirect, and the /login form's email
// sign-in success path. Any regression that drops a SAFE_NEXT_PREFIX entry,
// allows protocol-relative URLs through, or accepts absolute URLs would
// silently re-introduce the TIM-2721 deep-link symptom OR open the redirect
// surface to phishing redirect chains.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNext, SAFE_NEXT_PREFIXES } from "./safe-next.ts";

test("TIM-2730: preserves /workspace deep link with query (board's v2 case)", () => {
  assert.equal(
    resolveNext("/workspace/financials?ui=v2"),
    "/workspace/financials?ui=v2",
  );
});

test("TIM-2730: rejects absolute URL (open-redirect guard)", () => {
  assert.equal(resolveNext("https://evil.tld/x"), null);
  assert.equal(resolveNext("http://evil.tld/workspace"), null);
});

test("TIM-2730: rejects protocol-relative URL (open-redirect guard)", () => {
  assert.equal(resolveNext("//evil.tld/workspace"), null);
});

test("TIM-2730: rejects path outside SAFE_NEXT_PREFIXES", () => {
  assert.equal(resolveNext("/admin/secret"), null);
  assert.equal(resolveNext("/api/dump"), null);
});

test("TIM-2730: rejects null / empty / non-string-rooted input", () => {
  assert.equal(resolveNext(null), null);
  assert.equal(resolveNext(""), null);
  assert.equal(resolveNext("workspace"), null);
});

test("TIM-2730: SAFE_NEXT_PREFIXES still covers every post-login destination", () => {
  // If a new top-level surface is added (e.g. /billing), it MUST be added to
  // SAFE_NEXT_PREFIXES or session-expiry bounces will drop users on /dashboard.
  const required = [
    "/dashboard",
    "/onboarding",
    "/workspace",
    "/plan",
    "/account",
    "/reset-password",
  ];
  for (const prefix of required) {
    assert.ok(
      SAFE_NEXT_PREFIXES.includes(prefix),
      `SAFE_NEXT_PREFIXES is missing ${prefix} — TIM-2730 / TIM-2327 contract broken`,
    );
  }
});
