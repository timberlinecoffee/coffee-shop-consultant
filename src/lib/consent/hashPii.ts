/**
 * SHA-256 hashing for PII sent to Meta Conversions API (and Google Ads enhanced
 * conversions). Per TIM-1835: ALL personally identifiable fields sent server-side
 * (email, phone) MUST be normalized and SHA-256 hashed before they leave our
 * servers. Never send raw email/phone to an ad platform.
 *
 * Normalization follows Meta's Advanced Matching spec: lowercase + trim email,
 * digits-only phone with country code, no leading "+". Same hashing satisfies
 * Google Ads enhanced-conversions requirements.
 *
 * Uses Web Crypto (globalThis.crypto.subtle), available in the Node and Edge
 * runtimes, so this works from API routes and edge functions alike.
 */

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash a normalized email. Returns undefined for empty/invalid input. */
export async function hashEmail(email: string | null | undefined): Promise<string | undefined> {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return undefined;
  return sha256Hex(normalized);
}

/**
 * Hash a normalized phone number. Strips all non-digits; caller should pass a
 * number that already includes the country code (Meta requires it). Returns
 * undefined when no digits remain.
 */
export async function hashPhone(phone: string | null | undefined): Promise<string | undefined> {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return undefined;
  return sha256Hex(digits);
}

/** Generic SHA-256 for other Advanced Matching fields (first name, city, etc.). */
export async function hashNormalized(value: string | null | undefined): Promise<string | undefined> {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256Hex(normalized);
}

export { sha256Hex };
