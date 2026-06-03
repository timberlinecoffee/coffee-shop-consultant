-- TIM-1623: Affiliate application form storage + CASL consent record
CREATE TABLE public.affiliate_applications (
  id                           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name                   TEXT        NOT NULL,
  last_name                    TEXT        NOT NULL,
  email                        TEXT        NOT NULL,
  business_name                TEXT        NOT NULL,
  role                         TEXT        NOT NULL,
  role_other                   TEXT,
  platform_audience            TEXT        NOT NULL,
  why_referring                TEXT        NOT NULL,
  affiliate_agreement_accepted BOOLEAN     NOT NULL DEFAULT FALSE,
  casl_consent_accepted        BOOLEAN     NOT NULL DEFAULT FALSE,
  casl_consent_at              TIMESTAMPTZ,
  casl_consent_ip              TEXT,
  status                       TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

-- Submissions go through the service-role API route only.
-- No public read/write; Trent reviews via Supabase dashboard.
CREATE POLICY "No direct access" ON public.affiliate_applications
  AS RESTRICTIVE FOR ALL USING (false);

CREATE INDEX idx_affiliate_applications_email   ON public.affiliate_applications (email);
CREATE INDEX idx_affiliate_applications_status  ON public.affiliate_applications (status);
CREATE INDEX idx_affiliate_applications_created ON public.affiliate_applications (created_at DESC);
