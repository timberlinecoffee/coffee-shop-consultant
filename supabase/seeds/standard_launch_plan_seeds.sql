-- standard_launch_milestones + standard_hiring_roles reference seed
-- W6 Launch Plan workspace — starter templates for AI anchors (TIM-624-D / TIM-734)
--
-- Sources:
--   SCA "Opening a Coffee Business" guide (sca.coffee/resources/opening-a-coffee-business)
--   National Coffee Association "Opening Your Coffee Business" (ncausa.org/Find-a-Resource/Opening-Your-Coffee-Business)
--   Washington State L&I prevailing wage tables 2026 (lni.wa.gov/licensing-permits/public-works/prevailing-wage)
--   Oregon Bureau of Labor and Industries 2026 wage survey (oregon.gov/boli)
--   Specialty Coffee Retailer "Hiring Your First Team" 2024 (specialty-coffee-retailer.com/category/retail)
--   James Hoffmann / World Atlas of Coffee community launch checklists (jameshoffmann.co.uk)
--   Internal Timberline Coffee School launch playbook (internal, derived from 3 prior school launches)
--
-- Idempotent: ON CONFLICT (id) DO NOTHING — safe to re-run.
-- All rates in US cents per hour (Pacific Northwest market, 2026).
-- day_offset: negative = T-minus, 0 = Day 0 (opening day), positive = post-open days.

-- ============================================================
-- STANDARD LAUNCH MILESTONES  (~10 rows)
-- ============================================================

INSERT INTO public.standard_launch_milestones
  (id, day_offset, title, recommended_owner, dependency_hint, why)
VALUES

-- T-120: Legal & licensing foundation
(
  '11111111-0000-0000-0000-000000000001',
  -120,
  'File business entity + obtain EIN',
  'Founder / legal counsel',
  'None — this is the first milestone.',
  'You cannot open a bank account, sign a lease, or hire employees without an EIN and a registered business entity. Doing this 120 days out gives you buffer for state processing delays, which can run 4–6 weeks in Washington and Oregon.'
),

-- T-90: Location secured
(
  '11111111-0000-0000-0000-000000000002',
  -90,
  'Sign lease and receive keys',
  'Founder',
  'Business entity must exist (T-120). Financing must be confirmed.',
  'Construction and permitting timelines are driven entirely by the lease start date. Slipping the lease by two weeks typically shifts opening day by the same amount — and you pay rent during the slip.'
),

-- T-90: Health & building permits submitted
(
  '11111111-0000-0000-0000-000000000003',
  -90,
  'Submit health permit + building permit applications',
  'Founder / general contractor',
  'Lease signed (T-90). Final floor plan drafted.',
  'Health and building permits in most Pacific NW municipalities take 4–8 weeks to approve. Missing this window is the single most common cause of opening delays for first-time operators.'
),

-- T-60: Equipment ordered
(
  '11111111-0000-0000-0000-000000000004',
  -60,
  'Place equipment orders (espresso machine, grinders, refrigeration)',
  'Founder / equipment vendor',
  'Space dimensions confirmed post-lease. Budget approved.',
  'Commercial espresso machines have 6–10 week lead times from major suppliers (La Marzocco, Synesso). Ordering at T-60 is the latest safe window for a Day 0 install and calibration.'
),

-- T-30: Staff hired
(
  '11111111-0000-0000-0000-000000000005',
  -30,
  'Complete first-round hiring (barista trainer + ops assistant)',
  'Founder / instructor',
  'Payroll account open. Job descriptions posted by T-60.',
  'New hires need 2–4 weeks of pre-open training before they can run a shift independently. Hiring at T-30 gives exactly that window before soft-open.'
),

-- T-14: Permits in hand + equipment installed
(
  '11111111-0000-0000-0000-000000000006',
  -14,
  'All permits approved; equipment installed and commissioned',
  'General contractor / founder',
  'Permits submitted at T-90. Equipment ordered at T-60.',
  'Two weeks is the minimum buffer for punch-list items, equipment calibration, and the health inspector walk-through. Running these in parallel is not possible — the inspector will not sign off on an incomplete build-out.'
),

-- T-7: Soft open / friends-and-family dry run
(
  '11111111-0000-0000-0000-000000000007',
  -7,
  'Soft open — friends, family, and beta guests only',
  'Founder / barista trainer',
  'All permits in hand (T-14). Staff trained.',
  'A controlled soft open surfaces menu gaps, POS errors, and workflow bottlenecks before paying strangers arrive. Every coffee business that skips this step reports regretting it.'
),

-- T-3: Marketing push live
(
  '11111111-0000-0000-0000-000000000008',
  -3,
  'Launch social media announcement + local press outreach',
  'Marketing contractor / founder',
  'Photos and branding assets ready. Opening date confirmed.',
  'Three days gives enough lead time for a local neighborhood blog, food media, or Instagram algorithm to surface the post before Day 0. Earlier risks announcing before the date is locked; later leaves no runway for organic reach.'
),

-- Day 0: Grand opening
(
  '11111111-0000-0000-0000-000000000009',
  0,
  'Grand opening — first day of public service',
  'Founder / full team',
  'All prior milestones complete. POS live. Cash float prepared.',
  'Opening day sets the brand impression for the neighborhood. Staff-to-customer ratio should be 2–3× normal to absorb the surge and deliver an experience worth repeating.'
),

-- Day +7: Post-open review
(
  '11111111-0000-0000-0000-000000000010',
  7,
  'Post-open operations review + menu calibration',
  'Founder / barista trainer',
  'One full week of service data collected.',
  'The first seven days always reveal one unexpected bottleneck — a drink that takes too long, a supplier that misses delivery windows, or a POS configuration error. Scheduling a structured review at Day +7 prevents these from becoming permanent.'
),

-- Day +30: First financial close
(
  '11111111-0000-0000-0000-000000000011',
  30,
  'First monthly financial close + break-even check',
  'Founder / fractional bookkeeper',
  'One full month of revenue and expense data. Bookkeeper onboarded by T-30.',
  'Month one actuals will differ from projections. Comparing them at Day +30 while memory is fresh allows fast correction — adjusting labor hours, renegotiating vendor terms, or tweaking menu pricing before patterns solidify.'
)

ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STANDARD HIRING ROLES  (7 rows)
-- Pacific NW market hourly rates, 2026.
-- start_date_offset_days: days from Day 0 (negative = pre-open hire).
-- ============================================================

INSERT INTO public.standard_hiring_roles
  (id, role_title, hours_per_week_typical, rate_low_cents, rate_high_cents, start_date_offset_days, notes)
VALUES

-- Founder / Lead Instructor
(
  '22222222-0000-0000-0000-000000000001',
  'Founder / Lead Instructor',
  50.0,
  0,
  0,
  -120,
  'Owner-operator. No market rate — sweat equity. Listed for completeness in the org chart. Start at T-120 (day business is formed).'
),

-- Part-time Barista Trainer
(
  '22222222-0000-0000-0000-000000000002',
  'Part-time Barista Trainer',
  20.0,
  2200,
  2800,
  -30,
  'Trains new hires on espresso fundamentals and service standards. Hire at T-30 to run pre-open training sessions before staff are customer-facing. Pacific NW rate range: $22–$28/hr (2026 BLS/BOLI survey).'
),

-- Weekend Operations Assistant
(
  '22222222-0000-0000-0000-000000000003',
  'Weekend Operations Assistant',
  16.0,
  1900,
  2300,
  -30,
  'Covers weekend shifts for bar support, restocking, and light cleaning. Hire at T-30 to train alongside barista trainer. Pacific NW rate range: $19–$23/hr.'
),

-- Marketing Contractor
(
  '22222222-0000-0000-0000-000000000004',
  'Marketing Contractor',
  10.0,
  5000,
  8500,
  -60,
  'Part-time / project-based. Handles brand photography, social content calendar, and grand-opening press outreach. Engage at T-60 so brand assets are ready for T-3 announcement. Pacific NW freelance rate: $50–$85/hr.'
),

-- Fractional Bookkeeper
(
  '22222222-0000-0000-0000-000000000005',
  'Fractional Bookkeeper',
  4.0,
  5500,
  9000,
  -30,
  'Monthly close, sales-tax filings, payroll reconciliation. Engage at T-30 to set up chart of accounts and payroll before first hires appear on the books. Pacific NW fractional rate: $55–$90/hr.'
),

-- Social Media Contractor
(
  '22222222-0000-0000-0000-000000000006',
  'Social Media Contractor',
  8.0,
  3500,
  6000,
  -14,
  'Manages daily Instagram/TikTok posting, story replies, and community engagement. Ramp up at T-14 so the channel is warm by grand opening. Often the same person as the marketing contractor at this scale; separate line item if budget allows specialization. Pacific NW rate: $35–$60/hr.'
),

-- Deep-clean Contractor
(
  '22222222-0000-0000-0000-000000000007',
  'Deep-clean Contractor',
  4.0,
  2500,
  3800,
  0,
  'Weekly or bi-weekly deep clean of bar, equipment, and back-of-house. Schedule from Day 0 forward. Not a hire — typically a cleaning service on a recurring contract. Pacific NW commercial cleaning rate: $25–$38/hr equivalent.'
)

ON CONFLICT (id) DO NOTHING;
