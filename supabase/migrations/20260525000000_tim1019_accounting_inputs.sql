-- TIM-1019: Add accounting_inputs column to financial_models for Phase 2 financial suite.
-- Stores AccountingInputs data (revenue mix, COGS splits, startup costs, financing).
-- The primary UI uses workspace_documents; this column is the durable structured store.
alter table public.financial_models
  add column if not exists accounting_inputs jsonb not null default '{}';
