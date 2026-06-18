// TIM-2327: pin SAFE_NEXT_PREFIXES + resolveNext behavior. A regression that
// drops /workspace from the allowlist (or weakens the open-redirect guard)
// would silently re-break Google-OAuth deep links and re-introduce the bug.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNext, SAFE_NEXT_PREFIXES } from "../../../lib/safe-next.ts";

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
