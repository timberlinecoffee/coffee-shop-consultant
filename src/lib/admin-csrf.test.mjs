// TIM-1958: Unit tests for assertAdminRequestSecurity CSRF helper.
// The helper is inlined below so this test requires no Next.js runtime.

import test from "node:test";
import assert from "node:assert/strict";

// Inline the helper under test (mirrors src/lib/admin-auth.ts).
function assertAdminRequestSecurity(request, env = {}) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) {
    return { status: 415 };
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return { status: 403 };
  }

  const allowedOrigins = [
    env.NEXT_PUBLIC_SITE_URL,
    env.NEXT_PUBLIC_APP_URL,
  ]
    .filter(Boolean)
    .map((u) => u.replace(/\/$/, "").toLowerCase());

  if (!allowedOrigins.includes(origin.toLowerCase())) {
    return { status: 403 };
  }

  return null;
}

function makeRequest(headers) {
  return { headers: new Headers(headers) };
}

const ENV = {
  NEXT_PUBLIC_SITE_URL: "https://groundwork.app",
  NEXT_PUBLIC_APP_URL: "https://app.groundwork.app",
};

test("CSRF: rejects text/plain Content-Type (cross-site form)", () => {
  const req = makeRequest({ "content-type": "text/plain", "origin": "https://groundwork.app" });
  const result = assertAdminRequestSecurity(req, ENV);
  assert.equal(result?.status, 415);
});

test("CSRF: rejects missing Content-Type", () => {
  const req = makeRequest({ "origin": "https://groundwork.app" });
  const result = assertAdminRequestSecurity(req, ENV);
  assert.equal(result?.status, 415);
});

test("CSRF: rejects absent Origin header (fail closed)", () => {
  const req = makeRequest({ "content-type": "application/json" });
  const result = assertAdminRequestSecurity(req, ENV);
  assert.equal(result?.status, 403);
});

test("CSRF: rejects foreign Origin", () => {
  const req = makeRequest({
    "content-type": "application/json",
    "origin": "https://evil.example.com",
  });
  const result = assertAdminRequestSecurity(req, ENV);
  assert.equal(result?.status, 403);
});

test("CSRF: allows NEXT_PUBLIC_SITE_URL origin", () => {
  const req = makeRequest({
    "content-type": "application/json",
    "origin": "https://groundwork.app",
  });
  const result = assertAdminRequestSecurity(req, ENV);
  assert.equal(result, null);
});

test("CSRF: allows NEXT_PUBLIC_APP_URL origin", () => {
  const req = makeRequest({
    "content-type": "application/json",
    "origin": "https://app.groundwork.app",
  });
  const result = assertAdminRequestSecurity(req, ENV);
  assert.equal(result, null);
});

test("CSRF: application/json with charset passes", () => {
  const req = makeRequest({
    "content-type": "application/json; charset=utf-8",
    "origin": "https://groundwork.app",
  });
  const result = assertAdminRequestSecurity(req, ENV);
  assert.equal(result, null);
});
