// TIM-2517: prove the bumped working_capital + cash_buffer defaults raise the
// runway band on the QA scenario — factory plan with funding sources zeroed,
// so opening cash equals (working_capital_reserve + opening_cash_buffer)
// alone and the plan must absorb ramp losses from those two buckets.

import {
  defaultMonthlyProjections,
  defaultStartupCosts,
  deriveFinancialInputs,
  computeMonthlySlices,
} from "../src/lib/financial-projection.ts";
import { computeOpeningRunway } from "../src/lib/business-plan/opening-runway.ts";

function run(label, scOverride) {
  const baseMp = defaultMonthlyProjections();
  const mp = {
    ...baseMp,
    funding_sources: [],
    startup_costs: { ...(baseMp.startup_costs ?? {}), ...scOverride },
  };
  const fi = deriveFinancialInputs(mp);
  const bsInputs = {
    equipment_cost_cents: fi.equipment_cost_cents,
    buildout_cost_cents: fi.buildout_cost_cents,
    rent_deposits_cents: fi.rent_deposits_cents,
    license_permits_cents: fi.license_permits_cents,
    pre_opening_marketing_cents: fi.pre_opening_marketing_cents,
    initial_inventory_cents: fi.initial_inventory_cents,
    startup_supplies_cents: fi.startup_supplies_cents,
    professional_fees_cents: fi.professional_fees_cents,
  };
  const slices = computeMonthlySlices(
    mp,
    { total_cost_cents: 0, financed_cost_cents: 0 },
    bsInputs
  );
  const openingCash =
    (mp.startup_costs.working_capital_reserve_cents ?? 0) +
    (mp.startup_costs.opening_cash_buffer_cents ?? 0);
  const runway = computeOpeningRunway({
    openingCashCents: openingCash,
    rampMonthlyNetIncomeCents: slices.slice(0, mp.ramp_months).map((s) => s.net_income_cents),
  });
  const fmt = (c) => `$${(c / 100).toLocaleString()}`;
  console.log(`── ${label}`);
  console.log(
    `   openingCash=${fmt(openingCash)}  avgRampLoss=${fmt(runway.avgMonthlyLossCents)}  runway=${runway.runwayMonths?.toFixed(2) ?? "n/a"} months  band=${runway.band}`
  );
}

// Old defaults: $15k + $10k = $25k → the QA-reported insolvency
run("PRE  TIM-2517 (old defaults $15k+$10k=$25k)", {
  working_capital_reserve_cents: 1_500_000,
  opening_cash_buffer_cents: 1_000_000,
});

// New defaults: $45k + $20k = $65k
run("POST TIM-2517 (new defaults $45k+$20k=$65k)", {});
