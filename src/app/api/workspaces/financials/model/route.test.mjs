// TIM-2463: source-level pin that the financial_models auto-create paths read
// the account's currency_code (and fiscal_year_start_month) instead of falling
// back to USD. Both insert sites — the workspace server component and this
// route's GET — call getAccountSettings(...) before insert and override the
// fields on the defaultMonthlyProjections() blob. A regression here ships USD
// to non-USD accounts (the original TIM-2463 surface).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROUTE_SRC = readFileSync(resolve(here, "./route.ts"), "utf8");
// TIM-3448: was "../../../../workspace/financials/page.tsx". The page moved
// into the (app) route group and this path was never updated, so the file read
// threw ENOENT and BOTH tests in this file have been failing — which means the
// TIM-2463 currency guard has not actually been guarding anything. It is one
// of the 8 red tests on main that CI does not run.
const PAGE_SRC = readFileSync(
  resolve(here, "../../../../(app)/workspace/financials/page.tsx"),
  "utf8",
);

function asserts(src, label) {
  assert.ok(
    /getAccountSettings/.test(src),
    `${label}: expected getAccountSettings import/use`,
  );
  assert.ok(
    /forecastInputs\.currency_code\s*=\s*accountSettings\.currencyCode/.test(src),
    `${label}: expected currency_code override before insert`,
  );
  assert.ok(
    /forecastInputs\.fiscal_year_start_month\s*=\s*\n?\s*accountSettings\.localization\.fiscalYearStartMonth/.test(
      src,
    ),
    `${label}: expected fiscal_year_start_month override before insert`,
  );
}

test("financials/model GET overrides defaults with account currency before insert", () => {
  asserts(ROUTE_SRC, "route.ts");
});

test("workspace/financials/page auto-create overrides defaults with account currency before insert", () => {
  asserts(PAGE_SRC, "page.tsx");
});
