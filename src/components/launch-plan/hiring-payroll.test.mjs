// TIM-2477 / TIM-2454 F5: pin the Launch Plan total against the canonical
// loaded-payroll selector so the card can never re-introduce the old
// `monthly_cost_cents * headcount` reduce that dropped the benefits load.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BENEFITS_PCT,
  toPersonnelLine,
  totalLoadedMonthlyCents,
} from "./hiring-payroll.ts";
import { personnelLoadedMonthlyCents } from "../../lib/financial-projection.ts";

test("toPersonnelLine maps monthly_cost_cents to per-head base pay", () => {
  const line = toPersonnelLine({
    id: "r1",
    role_title: "Barista",
    headcount: 2,
    monthly_cost_cents: 400000, // $4,000/mo per head
    benefits_pct: 15,
  });
  assert.equal(line.pay_basis, "monthly");
  assert.equal(line.pay_amount_cents, 400000);
  assert.equal(line.headcount, 2);
  assert.equal(line.benefits_pct, 15);
  assert.equal(line.role, "Barista");
});

test("toPersonnelLine defaults benefits_pct when row.benefits_pct is missing", () => {
  const line = toPersonnelLine({
    id: "r1",
    role_title: "Barista",
    headcount: 1,
    monthly_cost_cents: 500000,
  });
  assert.equal(line.benefits_pct, DEFAULT_BENEFITS_PCT);
});

test("toPersonnelLine carries benefits_fixed_cents through when positive", () => {
  const line = toPersonnelLine({
    id: "r1",
    role_title: "Manager",
    headcount: 1,
    monthly_cost_cents: 500000,
    benefits_pct: 18,
    benefits_fixed_cents: 25000,
  });
  assert.equal(line.benefits_fixed_cents, 25000);
});

test("toPersonnelLine clamps null monthly_cost_cents and negative headcount to zero", () => {
  const line = toPersonnelLine({
    id: "r1",
    role_title: "Open",
    headcount: -3,
    monthly_cost_cents: null,
  });
  assert.equal(line.pay_amount_cents, 0);
  assert.equal(line.headcount, 0);
});

test("totalLoadedMonthlyCents byte-matches personnelLoadedMonthlyCents on each row", () => {
  const rows = [
    {
      id: "r1",
      role_title: "Barista",
      headcount: 2,
      monthly_cost_cents: 400000,
      benefits_pct: 15,
    },
    {
      id: "r2",
      role_title: "Store Manager",
      headcount: 1,
      monthly_cost_cents: 600000,
      benefits_pct: 18,
      benefits_fixed_cents: 25000,
    },
  ];

  const total = totalLoadedMonthlyCents(rows);

  // The canonical selector should produce the exact same number when fed
  // the rows via the adapter. This is the contract the Launch Plan card
  // must obey to match the Hiring workspace and Financials.
  const expected = rows.reduce(
    (sum, r) => sum + personnelLoadedMonthlyCents(toPersonnelLine(r)),
    0,
  );
  assert.equal(total, expected);
});

test("F5 regression: 15% benefits role — Launch Plan total includes the benefits load", () => {
  // A single Barista, $4,000/mo base, 15% benefits, headcount=1.
  // Old code: monthly_cost_cents * headcount = 400000 * 1 = 400000 (drops benefits)
  // New code: personnelLoadedMonthlyCents = 400000 + 400000*0.15 = 460000.
  const rows = [
    {
      id: "r1",
      role_title: "Barista",
      headcount: 1,
      monthly_cost_cents: 400000,
      benefits_pct: 15,
    },
  ];

  const oldTotal = rows.reduce(
    (sum, r) => sum + (r.monthly_cost_cents ?? 0) * r.headcount,
    0,
  );
  const newTotal = totalLoadedMonthlyCents(rows);

  assert.equal(oldTotal, 400000);
  assert.equal(newTotal, 460000);
  // Drift would have been 15% — exactly what TIM-2454 F5 called out.
  assert.equal(newTotal - oldTotal, 60000);
});

test("F5 parity: Launch Plan total matches Hiring workspace's loaded total at headcount=2", () => {
  // Two baristas, monthly base $3,500 each, 12% benefits + $5,000/head fixed.
  // The Hiring workspace surfaces personnelLoadedMonthlyCents directly. The
  // Launch Plan must agree to the cent.
  const rows = [
    {
      id: "r1",
      role_title: "Baristas",
      headcount: 2,
      monthly_cost_cents: 350000,
      benefits_pct: 12,
      benefits_fixed_cents: 5000,
    },
  ];

  const launchPlan = totalLoadedMonthlyCents(rows);
  const hiringWorkspace = personnelLoadedMonthlyCents({
    id: "r1",
    role: "Baristas",
    headcount: 2,
    pay_basis: "monthly",
    pay_amount_cents: 350000,
    benefits_pct: 12,
    benefits_fixed_cents: 5000,
    cost_category: "overhead",
  });

  assert.equal(launchPlan, hiringWorkspace);
});

test("drift guard: HiringPlanCard.tsx must not reintroduce the raw multiply reduce", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = fileURLToPath(new URL("./HiringPlanCard.tsx", import.meta.url));
  const source = await readFile(path, "utf8");
  // Old code shape: (r.monthly_cost_cents ?? 0) * r.headcount
  // The pinning test fails fast if a future edit re-introduces it.
  assert.equal(
    /\(\s*r\.monthly_cost_cents\s*\?\?\s*0\s*\)\s*\*\s*r\.headcount/.test(source),
    false,
    "HiringPlanCard.tsx reintroduced the raw monthly_cost_cents * headcount reduce — use totalLoadedMonthlyCents instead",
  );
  assert.ok(
    source.includes("totalLoadedMonthlyCents"),
    "HiringPlanCard.tsx must import totalLoadedMonthlyCents",
  );
});
