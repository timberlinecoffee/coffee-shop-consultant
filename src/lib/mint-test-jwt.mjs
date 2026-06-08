/**
 * mintTestJwt — create obviously-fake HS256 JWTs for unit/integration tests.
 *
 * NEVER use prod credentials here. Tokens are signed with a throwaway secret
 * and carry ref='test-ref' (not a real Supabase project ref).
 *
 * Usage:
 *   import { mintTestJwt } from "./mint-test-jwt.mjs";
 *   const anonToken  = mintTestJwt("anon");
 *   const adminToken = mintTestJwt("service_role");
 */

import { createHmac } from "node:crypto";

const THROWAWAY_SECRET = "this-is-a-throwaway-secret-for-tests-only";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * @param {"anon"|"service_role"} role
 * @returns {string} HS256 JWT — payload ref is "test-ref", NOT a real project
 */
export function mintTestJwt(role) {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    iss: "supabase",
    ref: "test-ref",
    role,
    iat: 1000000000,
    exp: 9999999999,
  });
  const sig = createHmac("sha256", THROWAWAY_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${header}.${payload}.${sig}`;
}
