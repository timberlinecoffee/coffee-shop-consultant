-- TIM-1304: W5 onboarding rethink - schema changes
-- 1. Add pre_boarding to onboarding_phase enum
ALTER TYPE onboarding_phase ADD VALUE IF NOT EXISTS 'pre_boarding' BEFORE 'day_1';

-- 2. Add detail column to onboarding_tasks
ALTER TABLE onboarding_tasks ADD COLUMN IF NOT EXISTS detail text;

-- 3. Add detail column to onboarding_plan_templates
ALTER TABLE onboarding_plan_templates ADD COLUMN IF NOT EXISTS detail text;
