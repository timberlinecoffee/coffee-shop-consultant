-- TIM-1483: per-document include/exclude picker for business plan financial appendix

CREATE TABLE business_plan_financial_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      uuid REFERENCES coffee_shop_plans(id) ON DELETE CASCADE NOT NULL,
  document_key text NOT NULL,
  is_visible   boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT bpfd_plan_doc_unique UNIQUE (plan_id, document_key)
);

ALTER TABLE business_plan_financial_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bpfd_select" ON business_plan_financial_documents
  FOR SELECT USING (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "bpfd_insert" ON business_plan_financial_documents
  FOR INSERT WITH CHECK (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "bpfd_update" ON business_plan_financial_documents
  FOR UPDATE USING (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE POLICY "bpfd_delete" ON business_plan_financial_documents
  FOR DELETE USING (
    plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION update_bpfd_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bpfd_updated_at
  BEFORE UPDATE ON business_plan_financial_documents
  FOR EACH ROW EXECUTE FUNCTION update_bpfd_updated_at();
