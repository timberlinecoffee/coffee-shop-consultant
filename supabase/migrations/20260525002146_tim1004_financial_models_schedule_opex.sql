-- TIM-1004: Financial Suite — per-day schedule + itemized operating expenses.
-- No column changes required; monthly_projections is already jsonb.
-- This migration documents the v3 schema evolution and adds a comment.

comment on column public.financial_models.monthly_projections is
  'v3 shape (TIM-1004): weekly_schedule (per-day open/close), itemized opex (labor, rent, marketing, utilities, insurance, tech, maintenance, supplies, other), interest_monthly_cents, taxes_pct. Normalizer in financial-projection.ts migrates v1/v2 rows on read.';
