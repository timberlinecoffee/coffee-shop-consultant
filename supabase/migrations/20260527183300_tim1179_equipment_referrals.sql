-- TIM-1179: Equipment referrals table for affiliate/partner links.
-- Admin-managed; read by the AI recommendation engine.
-- No RLS — access controlled at the API layer (admin email gate).

CREATE TABLE IF NOT EXISTS equipment_referrals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand       text        NOT NULL,
  model       text        NOT NULL,
  category    text        NOT NULL DEFAULT '',
  station     text        NOT NULL DEFAULT '',
  referral_url text       NOT NULL,
  partner_name text       NOT NULL DEFAULT '',
  notes       text        NOT NULL DEFAULT '',
  active_flag boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_referrals_active_idx
  ON equipment_referrals (active_flag);

CREATE INDEX IF NOT EXISTS equipment_referrals_brand_model_idx
  ON equipment_referrals (lower(brand), lower(model));
