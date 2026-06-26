-- TIM-3222: drop cohort/percentile benchmarking tables
-- Board confirmation: de037bad-e3fd-4e30-abf8-38f3d11d40bc (2026-06-26)
-- Plan rev: ac4bc5b6-ca5c-4c88-9002-5724a045a254
-- Order: extraction_runs → reference_values → best_practices → cohorts → metrics
-- (reverse-dependency order; CASCADE handles any remaining FK refs)
drop table if exists public.benchmark_extraction_runs cascade;
drop table if exists public.benchmark_reference_values cascade;
drop table if exists public.benchmark_best_practices cascade;
drop table if exists public.benchmark_cohorts cascade;
drop table if exists public.benchmark_metrics cascade;
