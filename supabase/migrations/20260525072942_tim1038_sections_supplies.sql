-- TIM-1038: Workstation sections for Equipment & Supplies lists + Supplies items table

-- Sections table (shared by equipment and supplies lists)
CREATE TABLE IF NOT EXISTS public.buildout_list_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.coffee_shop_plans(id) ON DELETE CASCADE,
  list_type TEXT NOT NULL CHECK (list_type IN ('equipment', 'supplies')),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  collapsed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.buildout_list_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_sections" ON public.buildout_list_sections;
CREATE POLICY "owner_all_sections" ON public.buildout_list_sections
  FOR ALL USING (
    plan_id IN (
      SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_buildout_list_sections_plan_type
  ON public.buildout_list_sections(plan_id, list_type);

-- Add section_id to equipment items
ALTER TABLE public.buildout_equipment_items
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.buildout_list_sections(id) ON DELETE SET NULL;

-- Supplies items table
CREATE TABLE IF NOT EXISTS public.buildout_supplies_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.coffee_shop_plans(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.buildout_list_sections(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  vendor TEXT,
  unit_type TEXT NOT NULL DEFAULT 'unit',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user_added' CHECK (source IN ('ai_suggested', 'user_added')),
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.buildout_supplies_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_supplies" ON public.buildout_supplies_items;
CREATE POLICY "owner_all_supplies" ON public.buildout_supplies_items
  FOR ALL USING (
    plan_id IN (
      SELECT id FROM public.coffee_shop_plans WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_buildout_supplies_items_plan
  ON public.buildout_supplies_items(plan_id, archived, position);
