// TIM-1729: Integration test for cross-workspace consistency engine.
// Tests the full detect→prompt→apply cycle against the real Supabase DB
// using service role credentials. Seeded against the qa-agent test user.
//
// Run: node --experimental-strip-types --no-warnings --test src/lib/cross-workspace-sync-integration.test.mjs
//
// This test is destructive to the qa-agent plan — it seeds and cleans up conflict data.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  detectConflicts,
  buildApplyPlan,
  conflictToSuggestion,
  parseFactValue,
} from "./cross-workspace-sync.ts";

const SUPABASE_URL = "https://ltmcttjftxzpgynhnrpg.supabase.co";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bWN0dGpmdHh6cGd5bmhucnBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjM5MDg2NywiZXhwIjoyMDkxOTY2ODY3fQ.HsIx2BzWVKeZQYG8-VY74fEqasQuoFcRcroh34MHl7c";
const QA_USER_ID = "0af5d99c-33c1-489c-805a-631acbb49178"; // qa-agent@timberline.coffee
const PLAN_ID = "f4958d74-b640-4e45-b3a8-043603c2340f";

// Conflict scenario: Location & Lease rent = $3,000/mo, Financials rent = $2,500/mo
const LOCATION_RENT_CENTS = 300_000; // $3,000.00
const FINANCIAL_RENT_CENTS = 250_000; // $2,500.00
const CANONICAL_CENTS = 300_000; // Location & Lease is authoritative

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let seededCandidateId = null;
let originalForecastInputs = null;

// Helpers that mirror the API route's data layer exactly.
async function loadChosenCandidate() {
  const { data } = await admin
    .from("location_candidates")
    .select("id,asking_rent_cents,sq_ft,status,position")
    .eq("plan_id", PLAN_ID)
    .eq("archived", false)
    .order("position", { ascending: true });
  if (!data || data.length === 0) return null;
  const signed = data.find((c) => c.status === "signed");
  const chosen = signed ?? data[0];
  return { id: chosen.id, asking_rent_cents: chosen.asking_rent_cents, sq_ft: chosen.sq_ft };
}

async function loadRentFromFinancials() {
  const { data } = await admin
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", PLAN_ID)
    .maybeSingle();
  if (!data?.forecast_inputs) return null;
  // Use the same normalization logic as the route
  const fi = data.forecast_inputs;
  const lines = fi?.forecast_lines ?? [];
  const rent = lines.find((l) => l.legacy_key === "rent");
  if (!rent || rent.mode !== "flat") return null;
  return typeof rent.value === "number" ? rent.value : null;
}

async function readAllReadings() {
  const [candidate, financialsRent] = await Promise.all([
    loadChosenCandidate(),
    loadRentFromFinancials(),
  ]);
  return {
    readings: [
      {
        locationId: "monthly_rent:location_lease",
        factId: "monthly_rent",
        value: candidate?.asking_rent_cents ?? null,
      },
      { locationId: "monthly_rent:financials", factId: "monthly_rent", value: financialsRent },
    ],
    candidateId: candidate?.id ?? null,
  };
}

// ── Seed / cleanup ────────────────────────────────────────────────────────────

before(async () => {
  // Save original financial forecast_inputs for teardown
  const { data: fm } = await admin
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", PLAN_ID)
    .maybeSingle();
  originalForecastInputs = fm?.forecast_inputs ?? null;

  // Create location candidate with $3,000/mo rent
  const { data: candidate, error: candErr } = await admin
    .from("location_candidates")
    .insert({
      plan_id: PLAN_ID,
      name: "QA Test Location (TIM-1729)",
      asking_rent_cents: LOCATION_RENT_CENTS,
      sq_ft: 1200,
      status: "shortlisted",
      position: 0,
      archived: false,
    })
    .select("id")
    .single();
  if (candErr) throw new Error(`Seed location_candidate failed: ${candErr.message}`);
  seededCandidateId = candidate.id;

  // Seed financial model with $2,500/mo rent (different → conflict)
  const seededForecast = {
    ...(originalForecastInputs ?? {}),
    forecast_lines: [
      {
        id: "seed-rent-line",
        label: "Rent",
        category: "overhead",
        mode: "flat",
        value: FINANCIAL_RENT_CENTS,
        legacy_key: "rent",
      },
    ],
  };
  const { error: fmErr } = await admin
    .from("financial_models")
    .upsert({ plan_id: PLAN_ID, forecast_inputs: seededForecast }, { onConflict: "plan_id" });
  if (fmErr) throw new Error(`Seed financial_models failed: ${fmErr.message}`);
});

after(async () => {
  // Remove the seeded location candidate
  if (seededCandidateId) {
    await admin.from("location_candidates").delete().eq("id", seededCandidateId);
  }
  // Restore original financial model
  await admin
    .from("financial_models")
    .upsert(
      { plan_id: PLAN_ID, forecast_inputs: originalForecastInputs ?? {} },
      { onConflict: "plan_id" },
    );
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("detect: rent conflict shows both workspace values and recommended canonical", async () => {
  const { readings } = await readAllReadings();

  // Verify seeded data is in place before detection
  assert.equal(
    readings.find((r) => r.locationId === "monthly_rent:location_lease")?.value,
    LOCATION_RENT_CENTS,
    "Location & Lease reading should be $3,000",
  );
  assert.equal(
    readings.find((r) => r.locationId === "monthly_rent:financials")?.value,
    FINANCIAL_RENT_CENTS,
    "Financials reading should be $2,500",
  );

  const conflicts = detectConflicts(readings);
  assert.equal(conflicts.length, 1, "Should detect exactly 1 conflict");

  const conflict = conflicts[0];
  assert.equal(conflict.factId, "monthly_rent");
  assert.equal(conflict.groups.length, 2, "Should have 2 value groups");
  assert.equal(conflict.recommendedValue, LOCATION_RENT_CENTS, "Location & Lease is authoritative");

  // Verify both workspaces are named in the groups
  const allWorkspaceLabels = conflict.groups.flatMap((g) => g.locations.map((l) => l.workspaceLabel));
  assert.ok(allWorkspaceLabels.includes("Location & Lease"), "Location & Lease should be named");
  assert.ok(allWorkspaceLabels.includes("Financials"), "Financials should be named");
});

test("detect: conflictToSuggestion produces AIReviewModal-compatible payload", async () => {
  const { readings } = await readAllReadings();
  const conflicts = detectConflicts(readings);
  assert.equal(conflicts.length, 1);

  const suggestion = conflictToSuggestion(conflicts[0]);
  assert.equal(suggestion.fieldId, "monthly_rent");
  assert.ok(suggestion.fieldLabel.includes("Monthly Rent"), "Label should name the fact");
  assert.ok(suggestion.originalValue.includes("$3,000.00"), "Original value should show $3,000");
  assert.ok(suggestion.originalValue.includes("$2,500.00"), "Original value should show $2,500");
  assert.equal(suggestion.proposedValue, "$3,000.00", "Proposed value should be authoritative ($3,000)");
  assert.equal(suggestion.isStructured, false);
});

test("nothing auto-applied: detect leaves both homes unchanged", async () => {
  // Run detect twice to prove it is purely read-only
  const { readings: r1 } = await readAllReadings();
  detectConflicts(r1);
  const { readings: r2 } = await readAllReadings();
  assert.equal(
    r2.find((r) => r.locationId === "monthly_rent:location_lease")?.value,
    LOCATION_RENT_CENTS,
    "Location & Lease unchanged after detect",
  );
  assert.equal(
    r2.find((r) => r.locationId === "monthly_rent:financials")?.value,
    FINANCIAL_RENT_CENTS,
    "Financials unchanged after detect",
  );
});

test("apply: POST canonical → both homes updated, re-detect finds no conflict", async () => {
  const { readings: before, candidateId } = await readAllReadings();
  const canonical = parseFactValue("currency_cents", "$3,000.00");
  assert.equal(canonical, CANONICAL_CENTS, "parseFactValue should parse $3,000.00 → 300000 cents");

  const ops = buildApplyPlan("monthly_rent", canonical, before);
  assert.equal(ops.length, 1, "Should only need to update Financials (Location already canonical)");
  assert.equal(ops[0].locationId, "monthly_rent:financials");
  assert.equal(ops[0].value, CANONICAL_CENTS);

  // Execute the op against the real database (mirrors the API route's executeOp)
  const { data: fm } = await admin
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", PLAN_ID)
    .maybeSingle();
  const fi = fm.forecast_inputs;
  const lines = fi?.forecast_lines ?? [];
  const rent = lines.find((l) => l.legacy_key === "rent");
  assert.ok(rent, "Rent line should exist");
  rent.mode = "flat";
  rent.value = canonical;
  const { error } = await admin
    .from("financial_models")
    .upsert({ plan_id: PLAN_ID, forecast_inputs: fi }, { onConflict: "plan_id" });
  assert.ok(!error, `Apply to Financials failed: ${error?.message}`);

  // Re-read and detect — should now be conflict-free
  const { readings: after } = await readAllReadings();
  assert.equal(
    after.find((r) => r.locationId === "monthly_rent:location_lease")?.value,
    CANONICAL_CENTS,
    "Location & Lease should still hold canonical",
  );
  assert.equal(
    after.find((r) => r.locationId === "monthly_rent:financials")?.value,
    CANONICAL_CENTS,
    "Financials should now hold canonical",
  );

  const conflictsAfter = detectConflicts(after);
  assert.equal(conflictsAfter.length, 0, "No conflicts after apply — both homes agree");
});
