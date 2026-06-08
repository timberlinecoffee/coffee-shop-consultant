// TIM-2350: pinning tests for the synchronous Klaviyo waitlist client.
//
// Contract:
//   1. POST /api/profiles/ — accept 201 OR 409 (conflict reuses existing id).
//   2. POST /api/lists/VZpvBY/relationships/profiles/ — accept 204.
//   3. Return ok:true only if BOTH succeed.
//   4. Sanitize upstream payloads on failure — surface reason codes only.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  subscribeToWaitlist,
  KLAVIYO_BASE,
  WAITLIST_LIST_ID,
} from "./klaviyo-subscribe.ts";

const PROFILES_URL = `${KLAVIYO_BASE}/api/profiles/`;
const LIST_URL = `${KLAVIYO_BASE}/api/lists/${WAITLIST_LIST_ID}/relationships/profiles/`;

let calls = [];

function jsonResponse(status, body) {
  const headers = new Headers({ "content-type": "application/json" });
  return new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
    status,
    headers,
  });
}

function installFetchScript(script) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const u = typeof url === "string" ? url : url.url;
    calls.push({ url: u, init });
    const handler = script[u];
    if (!handler) throw new Error(`unmocked fetch: ${u}`);
    return handler();
  };
}

beforeEach(() => {
  calls = [];
});

test("201 profile-create + 204 list-add → ok:true alreadyExisted=false", async () => {
  installFetchScript({
    [PROFILES_URL]: () =>
      jsonResponse(201, { data: { type: "profile", id: "01H-NEW-PROFILE" } }),
    [LIST_URL]: () => jsonResponse(204),
  });

  const result = await subscribeToWaitlist("pk-x", "fresh@example.com", "groundwork-ai-coming-soon");
  assert.deepEqual(result, {
    ok: true,
    profileId: "01H-NEW-PROFILE",
    alreadyExisted: false,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, PROFILES_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[1].url, LIST_URL);

  const profileBody = JSON.parse(calls[0].init.body);
  assert.equal(profileBody.data.attributes.email, "fresh@example.com");
  // Klaviyo's /api/profiles/ rejects the `subscriptions` field — we omit it
  // and rely on list-add for `can_receive_email_marketing` to flip true.
  assert.equal(profileBody.data.attributes.subscriptions, undefined);
  assert.equal(
    profileBody.data.attributes.properties.signup_source,
    "groundwork-ai-coming-soon",
  );

  const listBody = JSON.parse(calls[1].init.body);
  assert.equal(listBody.data[0].id, "01H-NEW-PROFILE");
  assert.equal(listBody.data[0].type, "profile");
});

test("409 duplicate profile → reuses id + 204 list-add → ok:true alreadyExisted=true", async () => {
  installFetchScript({
    [PROFILES_URL]: () =>
      jsonResponse(409, {
        errors: [
          {
            status: 409,
            code: "duplicate_profile",
            meta: { duplicate_profile_id: "01H-EXISTING" },
          },
        ],
      }),
    [LIST_URL]: () => jsonResponse(204),
  });

  const result = await subscribeToWaitlist("pk-x", "existing@example.com", "groundwork-ai-coming-soon");
  assert.deepEqual(result, {
    ok: true,
    profileId: "01H-EXISTING",
    alreadyExisted: true,
  });

  const listBody = JSON.parse(calls[1].init.body);
  assert.equal(listBody.data[0].id, "01H-EXISTING");
});

test("profile-create 500 → status:502 + list-add NOT called", async () => {
  installFetchScript({
    [PROFILES_URL]: () =>
      jsonResponse(500, { errors: [{ detail: "internal-secret-detail" }] }),
    [LIST_URL]: () => {
      throw new Error("list-add must not be reached when profile-create fails");
    },
  });

  const result = await subscribeToWaitlist("pk-x", "fail@example.com", "groundwork-ai-coming-soon");
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.reason, "profile-create-500");
  assert.ok(!result.reason.includes("internal-secret-detail"));
  assert.equal(calls.length, 1);
});

test("profile-create 429 → status:429 + list-add NOT called", async () => {
  installFetchScript({
    [PROFILES_URL]: () => jsonResponse(429, {}),
    [LIST_URL]: () => {
      throw new Error("list-add must not be reached on profile-create 429");
    },
  });

  const result = await subscribeToWaitlist("pk-x", "throttle@example.com", "src");
  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.equal(result.reason, "profile-create-rate-limited");
  assert.equal(calls.length, 1);
});

test("list-add 500 → status:502 with profile id in reason for log triage", async () => {
  installFetchScript({
    [PROFILES_URL]: () =>
      jsonResponse(201, { data: { type: "profile", id: "01H-LEFT-ORPHAN" } }),
    [LIST_URL]: () => jsonResponse(500, { errors: [{ detail: "list bus failure" }] }),
  });

  const result = await subscribeToWaitlist("pk-x", "list-fail@example.com", "src");
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.ok(result.reason.startsWith("list-add-500"));
  assert.ok(result.reason.includes("01H-LEFT-ORPHAN"));
  assert.equal(calls.length, 2);
});

test("list-add 429 → status:429", async () => {
  installFetchScript({
    [PROFILES_URL]: () =>
      jsonResponse(201, { data: { type: "profile", id: "01H-LATE" } }),
    [LIST_URL]: () => jsonResponse(429, {}),
  });

  const result = await subscribeToWaitlist("pk-x", "list-throttle@example.com", "src");
  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.ok(result.reason.startsWith("list-add-rate-limited"));
});

test("profile-create 201 missing id → status:502", async () => {
  installFetchScript({
    [PROFILES_URL]: () => jsonResponse(201, { data: { type: "profile" } }),
    [LIST_URL]: () => jsonResponse(204),
  });

  const result = await subscribeToWaitlist("pk-x", "missing-id@example.com", "src");
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.reason, "profile-create-201-missing-id");
  assert.equal(calls.length, 1);
});

test("profile-create 409 missing duplicate_profile_id → status:502", async () => {
  installFetchScript({
    [PROFILES_URL]: () =>
      jsonResponse(409, { errors: [{ status: 409, detail: "duplicate" }] }),
    [LIST_URL]: () => jsonResponse(204),
  });

  const result = await subscribeToWaitlist("pk-x", "missing-dup@example.com", "src");
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.reason, "profile-create-409-missing-duplicate-id");
  assert.equal(calls.length, 1);
});

test("network error on profile-create → status:502 sanitized", async () => {
  installFetchScript({
    [PROFILES_URL]: () => {
      throw new Error("ECONNRESET");
    },
    [LIST_URL]: () => jsonResponse(204),
  });

  const result = await subscribeToWaitlist("pk-x", "neterr@example.com", "src");
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.ok(result.reason.startsWith("profile-create-network"));
});

test("Klaviyo headers carry revision + auth on both calls", async () => {
  installFetchScript({
    [PROFILES_URL]: () =>
      jsonResponse(201, { data: { type: "profile", id: "01H-HEADER" } }),
    [LIST_URL]: () => jsonResponse(204),
  });

  await subscribeToWaitlist("pk-secret-1234", "hdr@example.com", "src");

  for (const c of calls) {
    const h = c.init.headers;
    assert.equal(h.Authorization, "Klaviyo-API-Key pk-secret-1234");
    assert.equal(h.revision, "2024-10-15");
    assert.equal(h["Content-Type"], "application/json");
  }
});
