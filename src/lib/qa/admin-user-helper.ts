// TIM-677: Safe QA fixture user lookup via Supabase Admin Auth API.
// Filters server-side, hard-fails on ambiguity, refuses non-fixture addresses.
import type { SupabaseClient } from "@supabase/supabase-js";

// Only qa-*@timberline.coffee addresses are allowed as fixture targets.
const FIXTURE_EMAIL_RE = /^qa-[^@]+@timberline\.coffee$/;

export class QAUserLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QAUserLookupError";
  }
}

/**
 * Assert that the given email matches the QA fixture allowlist pattern.
 * Throws QAUserLookupError for any non-fixture address — belt-and-suspenders
 * guard against the [0]-fallback bug class from TIM-676.
 */
export function assertFixtureEmail(email: string): void {
  if (!FIXTURE_EMAIL_RE.test(email)) {
    throw new QAUserLookupError(
      `Write refused: '${email}' is not a QA fixture address (must match qa-*@timberline.coffee)`
    );
  }
}

/**
 * Look up exactly one Supabase Auth user by email using server-side filtering.
 *
 * - Filters server-side via the GoTrue `filter` parameter — never list-then-scan.
 * - Throws if no user matches.
 * - Throws if more than one user matches (ambiguous).
 * - Refuses non-fixture email addresses before making any API call.
 */
export async function lookupFixtureUserByEmail(
  adminClient: SupabaseClient,
  email: string
) {
  assertFixtureEmail(email);

  const { data, error } = await adminClient.auth.admin.listUsers({
    // Server-side GoTrue filter — avoids client-side list-then-scan.
    filter: `email=${email}`,
    perPage: 1000,
  });

  if (error) {
    throw new QAUserLookupError(`Admin user lookup failed: ${error.message}`);
  }

  const users = data?.users ?? [];

  if (users.length === 0) {
    throw new QAUserLookupError(`No user found with email: ${email}`);
  }

  if (users.length > 1) {
    throw new QAUserLookupError(
      `Ambiguous lookup: ${users.length} users matched email '${email}' — fixture accounts must be unique`
    );
  }

  return users[0];
}
