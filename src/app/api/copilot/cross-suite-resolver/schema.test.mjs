// TIM-2467: confirm ApplyBodySchema rejects wrong shapes with field-level errors
// rather than a generic "Invalid request body" string.
//
// Run via:
//   node --test --experimental-strip-types --experimental-transform-types \
//     src/app/api/copilot/cross-suite-resolver/schema.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

// Mirror the production schema (intentional duplication — keeps test free of
// route-module imports that pull in next/server, supabase, etc.).
const ChangeSchema = z.object({
  fieldId: z.string().min(1).max(200),
  finalValue: z.string().min(0).max(200),
});
const ApplyBodySchema = z.object({
  conflictId: z.string().min(1).max(80),
  pathId: z.string().min(1).max(80),
  changes: z.array(ChangeSchema).min(1).max(20),
});

test("TIM-2467: wrong-shape body (planId/source) surfaces conflictId+pathId+changes errors", () => {
  const wrong = { planId: "p1", source: "financials" };
  const parsed = ApplyBodySchema.safeParse(wrong);
  assert.equal(parsed.success, false);
  const fields = parsed.error.flatten().fieldErrors;
  assert.ok(Array.isArray(fields.conflictId) && fields.conflictId.length > 0,
    "conflictId error must be present");
  assert.ok(Array.isArray(fields.pathId) && fields.pathId.length > 0,
    "pathId error must be present");
  assert.ok(Array.isArray(fields.changes) && fields.changes.length > 0,
    "changes error must be present");
});

test("TIM-2467: valid body parses cleanly", () => {
  const ok = {
    conflictId: "hiring_financials_v1",
    pathId: "raise_budget",
    changes: [{ fieldId: "cross_suite:c1:p1:financials:rec1:col1", finalValue: "1000" }],
  };
  const parsed = ApplyBodySchema.safeParse(ok);
  assert.equal(parsed.success, true);
});

test("TIM-2467: empty changes array fails with array-level error", () => {
  const tooFew = { conflictId: "c1", pathId: "p1", changes: [] };
  const parsed = ApplyBodySchema.safeParse(tooFew);
  assert.equal(parsed.success, false);
  const fields = parsed.error.flatten().fieldErrors;
  assert.ok(Array.isArray(fields.changes), "changes error must be present");
});
