-- TIM-1004 follow-up: separate forecast inputs from computed output.
-- Adds forecast_inputs column (user inputs) so monthly_projections can be
-- repurposed for the 60-row computed array in TIM-1006.

alter table public.financial_models
  add column if not exists forecast_inputs jsonb;

-- Migrate: copy existing user-inputs from monthly_projections into forecast_inputs.
update public.financial_models
set forecast_inputs = monthly_projections
where forecast_inputs is null
  and monthly_projections is not null;

comment on column public.financial_models.forecast_inputs is
  'User forecast inputs (TIM-1004): MonthlyProjections shape — daily_flow, avg_ticket_cents, weekly_schedule, cogs_pct, itemized opex (labor, rent, marketing, utilities, insurance, tech, maintenance, supplies, other), interest_monthly_cents, taxes_pct. Source of truth for computeMonthlyProjections().';

comment on column public.financial_models.monthly_projections is
  'v4 shape (TIM-1006): computed 60-row array [{ year, month, month_index, revenue_cents, ... }]. Populated by TIM-1006. Legacy v1/v2/v3 rows normalised on read via normalizeMonthlyProjections() in financial-projection.ts.';
