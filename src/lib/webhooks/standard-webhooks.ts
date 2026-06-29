// TIM-3022: minimal `standard-webhooks` verifier for the Supabase Send-Email
// Auth hook (https://github.com/standard-webhooks/standard-webhooks).
//
// Why inline instead of pulling the `standard-webhooks` npm package:
// adding a new dependency is excluded from SA-1, so it would gate this PR on
// a separate board confirmation. The signing scheme is small and
// well-specified — HMAC-SHA256 over `<id>.<timestamp>.<payload>` keyed by the
// raw secret bytes — so we implement it directly with a constant-time compare
// and a hardcoded ±5 minute tolerance, matching the reference implementation.

import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 5 * 60;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: VerifyFailureReason };

export type VerifyFailureReason =
  | 'missing_secret'
  | 'invalid_secret_format'
  | 'missing_headers'
  | 'timestamp_out_of_tolerance'
  | 'no_matching_signature';

export interface StandardWebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function extractHeaders(headers: Headers): StandardWebhookHeaders {
  return {
    id: headers.get('webhook-id'),
    timestamp: headers.get('webhook-timestamp'),
    signature: headers.get('webhook-signature'),
  };
}

// Parse a `whsec_*` secret into raw signing bytes. Supabase emits both
// formats: secrets prefixed with `whsec_` use base64 after the prefix; bare
// secrets are taken as-is (utf8) per the spec note for legacy SCIM-style
// senders. We accept both so the operator can paste whatever the Dashboard
// shows.
function decodeSecret(raw: string): Buffer | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\n/g, '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('whsec_')) {
    const b64 = trimmed.slice('whsec_'.length);
    try {
      const buf = Buffer.from(b64, 'base64');
      if (buf.length === 0) return null;
      return buf;
    } catch {
      return null;
    }
  }
  return Buffer.from(trimmed, 'utf8');
}

// Constant-time compare on base64 signatures. Buffer lengths must match for
// timingSafeEqual; an early bail on length difference is the standard
// trade-off (length is not secret).
function safeEqualBase64(a: string, b: string): boolean {
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, 'base64');
    bufB = Buffer.from(b, 'base64');
  } catch {
    return false;
  }
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface VerifyArgs {
  secret: string | undefined;
  headers: StandardWebhookHeaders;
  payload: string;
  // Wall-clock seconds — injectable for tests. Defaults to Math.floor(Date.now()/1000).
  nowSec?: number;
}

export function verifyStandardWebhook(args: VerifyArgs): VerifyResult {
  const decoded = decodeSecret(args.secret ?? '');
  if (!args.secret) return { ok: false, reason: 'missing_secret' };
  if (!decoded) return { ok: false, reason: 'invalid_secret_format' };

  const { id, timestamp, signature } = args.headers;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: 'missing_headers' };
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }
  const now = args.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  // Compute the expected v1 signature exactly as the spec defines.
  const signed = `${id}.${timestamp}.${args.payload}`;
  const expected = createHmac('sha256', decoded).update(signed).digest('base64');

  // `webhook-signature` is a space-separated list of `<version>,<b64sig>`
  // tokens; rotating senders include both the old and new signature in the
  // same header. We accept any v1 match.
  for (const token of signature.split(' ')) {
    const parts = token.trim().split(',');
    if (parts.length !== 2) continue;
    const [version, b64sig] = parts;
    if (version !== 'v1') continue;
    if (safeEqualBase64(expected, b64sig)) return { ok: true };
  }

  return { ok: false, reason: 'no_matching_signature' };
}

// Test-only helper: build a valid `webhook-signature` header value for a
// given payload + secret. Lets the integration test exercise the verify
// path without exposing the crypto guts in the route file.
export function signForTest(args: {
  id: string;
  timestamp: string;
  payload: string;
  secret: string;
}): string {
  const decoded = decodeSecret(args.secret);
  if (!decoded) throw new Error('signForTest: invalid secret');
  const signed = `${args.id}.${args.timestamp}.${args.payload}`;
  const sig = createHmac('sha256', decoded).update(signed).digest('base64');
  return `v1,${sig}`;
}
