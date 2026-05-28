-- TIM-1174: Section D — add vendor_candidate_id FK to buildout_equipment_items.
-- Separates Brand (vendor text field, free text) from Vendor (supplier you buy from,
-- linked to vendor_candidates table). Selecting a vendor from autocomplete stores the
-- FK here; the display name continues to live in the `supplier` text column.

ALTER TABLE public.buildout_equipment_items
  ADD COLUMN IF NOT EXISTS vendor_candidate_id uuid
    REFERENCES public.vendor_candidates(id) ON DELETE SET NULL;
