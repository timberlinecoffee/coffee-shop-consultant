-- TIM-1036: Marketing Suite v1
-- Tables: marketing_brand, marketing_digital_presence, marketing_content_posts,
--         marketing_campaigns, marketing_budget_lines

CREATE TABLE IF NOT EXISTS marketing_brand (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                 uuid REFERENCES coffee_shop_plans(id) ON DELETE CASCADE NOT NULL,
  positioning_statement   text NOT NULL DEFAULT '',
  brand_pillar_1          text NOT NULL DEFAULT '',
  brand_pillar_2          text NOT NULL DEFAULT '',
  brand_pillar_3          text NOT NULL DEFAULT '',
  do_say                  text NOT NULL DEFAULT '',
  dont_say                text NOT NULL DEFAULT '',
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  CONSTRAINT marketing_brand_plan_id_unique UNIQUE (plan_id)
);

ALTER TABLE marketing_brand ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_brand_select" ON marketing_brand
  FOR SELECT USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_brand_insert" ON marketing_brand
  FOR INSERT WITH CHECK (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_brand_update" ON marketing_brand
  FOR UPDATE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_brand_delete" ON marketing_brand
  FOR DELETE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS marketing_digital_presence (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid REFERENCES coffee_shop_plans(id) ON DELETE CASCADE NOT NULL,
  channel_name    text NOT NULL,
  status          text NOT NULL DEFAULT 'not_started',
  url_or_handle   text,
  owner           text,
  last_updated_at date,
  is_system       boolean NOT NULL DEFAULT false,
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE marketing_digital_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_digital_presence_select" ON marketing_digital_presence
  FOR SELECT USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_digital_presence_insert" ON marketing_digital_presence
  FOR INSERT WITH CHECK (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_digital_presence_update" ON marketing_digital_presence
  FOR UPDATE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_digital_presence_delete" ON marketing_digital_presence
  FOR DELETE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS marketing_content_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid REFERENCES coffee_shop_plans(id) ON DELETE CASCADE NOT NULL,
  post_date      date NOT NULL,
  channels       text[] NOT NULL DEFAULT '{}',
  theme          text NOT NULL DEFAULT '',
  format         text NOT NULL DEFAULT 'photo',
  caption_draft  text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'planned',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE marketing_content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_content_posts_select" ON marketing_content_posts
  FOR SELECT USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_content_posts_insert" ON marketing_content_posts
  FOR INSERT WITH CHECK (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_content_posts_update" ON marketing_content_posts
  FOR UPDATE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_content_posts_delete" ON marketing_content_posts
  FOR DELETE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             uuid REFERENCES coffee_shop_plans(id) ON DELETE CASCADE NOT NULL,
  name                text NOT NULL,
  objective           text NOT NULL DEFAULT 'awareness',
  channels            text[] NOT NULL DEFAULT '{}',
  start_date          date,
  end_date            date,
  budget_cents        integer NOT NULL DEFAULT 0,
  actual_spend_cents  integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'planned',
  key_results         text NOT NULL DEFAULT '',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_campaigns_select" ON marketing_campaigns
  FOR SELECT USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_campaigns_insert" ON marketing_campaigns
  FOR INSERT WITH CHECK (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_campaigns_update" ON marketing_campaigns
  FOR UPDATE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_campaigns_delete" ON marketing_campaigns
  FOR DELETE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS marketing_budget_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid REFERENCES coffee_shop_plans(id) ON DELETE CASCADE NOT NULL,
  channel_name  text NOT NULL,
  monthly_cents integer NOT NULL DEFAULT 0,
  is_system     boolean NOT NULL DEFAULT false,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE marketing_budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_budget_lines_select" ON marketing_budget_lines
  FOR SELECT USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_budget_lines_insert" ON marketing_budget_lines
  FOR INSERT WITH CHECK (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_budget_lines_update" ON marketing_budget_lines
  FOR UPDATE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));
CREATE POLICY "marketing_budget_lines_delete" ON marketing_budget_lines
  FOR DELETE USING (plan_id IN (SELECT id FROM coffee_shop_plans WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'marketing_brand_updated_at') THEN
    CREATE TRIGGER marketing_brand_updated_at BEFORE UPDATE ON marketing_brand FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'marketing_digital_presence_updated_at') THEN
    CREATE TRIGGER marketing_digital_presence_updated_at BEFORE UPDATE ON marketing_digital_presence FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'marketing_content_posts_updated_at') THEN
    CREATE TRIGGER marketing_content_posts_updated_at BEFORE UPDATE ON marketing_content_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'marketing_campaigns_updated_at') THEN
    CREATE TRIGGER marketing_campaigns_updated_at BEFORE UPDATE ON marketing_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'marketing_budget_lines_updated_at') THEN
    CREATE TRIGGER marketing_budget_lines_updated_at BEFORE UPDATE ON marketing_budget_lines FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
