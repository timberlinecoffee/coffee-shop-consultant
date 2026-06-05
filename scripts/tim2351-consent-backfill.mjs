#!/usr/bin/env node
/**
 * TIM-2357 backfill: find every Klaviyo profile on the Groundwork.AI Waitlist
 * that was created via the synchronous route (TIM-2350, post-2026-06-04T16:47Z)
 * and still has consent: NEVER_SUBSCRIBED, then submit a bulk-subscribe job to
 * record legal SUBSCRIBED consent + fire the Klaviyo confirmation email.
 *
 * Background: the two-step synchronous path (create-profile + list-add) does
 * NOT record SUBSCRIBED consent. The only endpoint that records it is
 * /api/profile-subscription-bulk-create-jobs/, which was silently dropping its
 * async queue starting ~2026-06-04T23:53Z (the original TIM-2349 outage). This
 * script should be run AFTER Klaviyo confirms bulk-subscribe-jobs is fixed.
 *
 * Two modes:
 *   --dry-run (default) — list affected profiles + estimated job payload.
 *   --apply             — submit the bulk-subscribe job (requires Klaviyo fix).
 *
 * Optional:
 *   --cutoff ISO8601    — override the default cutoff (2026-06-04T16:47:00Z).
 *   --list-id ID        — override list ID (default: VZpvBY).
 *   --batch-size N      — profiles per bulk job (default: 100, Klaviyo max: 100).
 *
 * Usage:
 *   KLAVIYO_PRIVATE_API_KEY=pk_... node scripts/tim2351-consent-backfill.mjs
 *   KLAVIYO_PRIVATE_API_KEY=pk_... node scripts/tim2351-consent-backfill.mjs --apply
 *
 * Output: JSON report to stdout; progress + errors to stderr.
 *
 * Test fixtures (from TIM-2357 issue, submitted during outage window):
 *   tim2350-bulk-retest-1780669861622@example.com  (2026-06-05 ~14:30Z)
 *   tim2350-bulk-control-1780670225@example.com    (2026-06-05 ~14:36Z)
 */

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_REVISION = "2024-10-15";
// Only profiles created after this moment are candidates — this is when
// TIM-2350's synchronous route went live and bulk-subscribe was abandoned.
const DEFAULT_CUTOFF = "2026-06-04T16:47:00Z";
const DEFAULT_LIST_ID = "VZpvBY";
const DEFAULT_BATCH_SIZE = 100;
// Only backfill profiles with a custom_source starting with this prefix.
const SOURCE_PREFIX = "groundwork-ai";

const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
if (!apiKey) {
  console.error("KLAVIYO_PRIVATE_API_KEY env var required");
  process.exit(2);
}

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");

function argValue(flag) {
  const idx = argv.indexOf(flag);
  return idx >= 0 ? argv[idx + 1] : null;
}

const cutoff = argValue("--cutoff") ?? DEFAULT_CUTOFF;
const listId = argValue("--list-id") ?? DEFAULT_LIST_ID;
const batchSize = parseInt(argValue("--batch-size") ?? DEFAULT_BATCH_SIZE, 10);

const kHeaders = {
  Authorization: `Klaviyo-API-Key ${apiKey}`,
  "Content-Type": "application/json",
  accept: "application/json",
  revision: KLAVIYO_REVISION,
};

async function klaviyoGet(url) {
  const res = await fetch(url, { headers: kHeaders });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} → ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

/**
 * Fetch all profiles from the list created after `cutoff` that still have
 * consent NEVER_SUBSCRIBED. Pages through Klaviyo's cursor-based pagination.
 */
async function fetchAffectedProfiles() {
  const affected = [];
  // Request fields we need: email, created, custom properties (for source
  // verification), and email subscription status.
  const baseUrl =
    `${KLAVIYO_API_BASE}/lists/${listId}/profiles/` +
    `?fields[profile]=email,created,subscriptions,properties` +
    `&filter=greater-than(created,${cutoff})` +
    `&page[size]=100`;

  let url = baseUrl;
  let page = 0;

  while (url) {
    page++;
    console.error(`  page ${page}: ${url}`);
    const data = await klaviyoGet(url);
    const profiles = data.data ?? [];

    for (const profile of profiles) {
      const attrs = profile.attributes ?? {};
      const email = attrs.email ?? "";
      const customSource = attrs.properties?.custom_source ?? "";
      const consent =
        attrs.subscriptions?.email?.marketing?.consent ?? "UNKNOWN";

      // Only backfill profiles from our signup form.
      if (!customSource.startsWith(SOURCE_PREFIX)) continue;

      if (consent === "NEVER_SUBSCRIBED" || consent === "UNKNOWN") {
        affected.push({
          id: profile.id,
          email,
          created: attrs.created,
          consent,
          customSource,
        });
      }
    }

    url = data.links?.next ?? null;
  }

  return affected;
}

/**
 * Submit a single bulk-subscribe job for up to `batchSize` profiles.
 * Returns the job id from the Klaviyo 202 response.
 */
async function submitBulkJob(profiles) {
  const payload = {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        profiles: {
          data: profiles.map((p) => ({
            type: "profile",
            attributes: {
              email: p.email,
              subscriptions: {
                email: {
                  marketing: { consent: "SUBSCRIBED" },
                },
              },
            },
          })),
        },
      },
      relationships: {
        list: {
          data: { type: "list", id: listId },
        },
      },
    },
  };

  const res = await fetch(
    `${KLAVIYO_API_BASE}/profile-subscription-bulk-create-jobs/`,
    {
      method: "POST",
      headers: kHeaders,
      body: JSON.stringify(payload),
    },
  );

  const body = await res.json().catch(() => null);

  if (res.status === 202) {
    return { ok: true, jobId: body?.data?.id ?? "(no id)", status: 202 };
  }
  return {
    ok: false,
    status: res.status,
    body: JSON.stringify(body).slice(0, 600),
  };
}

async function main() {
  console.error(
    `mode: ${apply ? "APPLY (will submit bulk-subscribe jobs)" : "dry-run (no changes)"}`,
  );
  console.error(`cutoff: ${cutoff}`);
  console.error(`list: ${listId}`);
  console.error(`batch size: ${batchSize}`);
  console.error("");
  console.error("fetching affected profiles from Klaviyo...");

  let affected;
  try {
    affected = await fetchAffectedProfiles();
  } catch (err) {
    console.error("ERROR fetching profiles:", err.message);
    process.exit(1);
  }

  console.error(
    `\nfound ${affected.length} profile(s) needing consent backfill`,
  );

  if (affected.length === 0) {
    console.error("nothing to do");
    process.stdout.write(
      JSON.stringify({ affected: 0, jobs: [], dryRun: !apply }, null, 2) + "\n",
    );
    return;
  }

  // Split into batches of batchSize.
  const batches = [];
  for (let i = 0; i < affected.length; i += batchSize) {
    batches.push(affected.slice(i, i + batchSize));
  }

  const report = {
    dryRun: !apply,
    cutoff,
    listId,
    affected: affected.length,
    batches: batches.length,
    profiles: affected,
    jobs: [],
  };

  if (!apply) {
    console.error(
      `\ndry-run complete. Re-run with --apply after Klaviyo confirms bulk-subscribe-jobs is fixed.`,
    );
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  console.error(`\nsubmitting ${batches.length} bulk-subscribe job(s)...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.error(`  batch ${i + 1}/${batches.length}: ${batch.length} profiles`);
    try {
      const result = await submitBulkJob(batch);
      if (result.ok) {
        console.error(`    ✓ job queued: ${result.jobId}`);
        report.jobs.push({
          batch: i + 1,
          profiles: batch.map((p) => p.email),
          jobId: result.jobId,
          status: "submitted",
        });
      } else {
        console.error(
          `    ✗ failed (${result.status}): ${result.body}`,
        );
        report.jobs.push({
          batch: i + 1,
          profiles: batch.map((p) => p.email),
          status: "error",
          httpStatus: result.status,
          body: result.body,
        });
      }
    } catch (err) {
      console.error(`    ✗ error: ${err.message}`);
      report.jobs.push({
        batch: i + 1,
        profiles: batch.map((p) => p.email),
        status: "error",
        error: err.message,
      });
    }

    // Respect Klaviyo rate limits — 1 req/s on bulk endpoints.
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  const failed = report.jobs.filter((j) => j.status !== "submitted").length;
  console.error(
    `\ncomplete: ${report.jobs.length - failed} job(s) submitted, ${failed} failed`,
  );
  if (failed > 0) {
    console.error(
      "WARN: some batches failed — check report.jobs for details and retry.",
    );
  }

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
