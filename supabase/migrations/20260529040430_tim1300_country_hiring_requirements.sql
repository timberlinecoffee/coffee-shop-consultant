-- TIM-1300: Country-specific hiring requirements framework.
-- Adds plan_hiring_settings (marked country per plan) + hiring_requirement_sets
-- (content-driven requirement library, seeded for US/GB/CA/AU).

-- ── plan_hiring_settings ──────────────────────────────────────────────────────

create table public.plan_hiring_settings (
  id                uuid        primary key default gen_random_uuid(),
  plan_id           uuid        not null unique references public.coffee_shop_plans(id) on delete cascade,
  hiring_country    char(2),    -- ISO-2 override: US, GB, CA, AU; null = auto-detect from location_candidates
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger handle_plan_hiring_settings_updated_at
  before update on public.plan_hiring_settings
  for each row execute procedure public.handle_updated_at();

alter table public.plan_hiring_settings enable row level security;

create policy "plan_owner_read_plan_hiring_settings"
  on public.plan_hiring_settings for select
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

create policy "plan_owner_write_plan_hiring_settings"
  on public.plan_hiring_settings for all
  using (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.coffee_shop_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

-- ── hiring_requirement_sets ───────────────────────────────────────────────────

create table public.hiring_requirement_sets (
  id              uuid        primary key default gen_random_uuid(),
  country_code    char(2)     not null,
  category        text        not null,
  title           text        not null,
  body            text        not null default '',
  citation_url    text,
  order_index     int         not null default 0,
  is_system       boolean     not null default true,
  created_at      timestamptz not null default now()
);

create index on public.hiring_requirement_sets (country_code, order_index);

alter table public.hiring_requirement_sets enable row level security;

-- System rows are visible to all authenticated users.
create policy "authenticated_read_hiring_requirement_sets"
  on public.hiring_requirement_sets for select
  to authenticated
  using (is_system = true);

-- ── Seed data ─────────────────────────────────────────────────────────────────
-- Bodies marked [Placeholder] — awaiting Legal Analyst authoring (TIM-1141).

insert into public.hiring_requirement_sets
  (country_code, category, title, body, citation_url, order_index)
values
  -- ── United States ──
  ('US', 'Work Eligibility',          'Form I-9 Employment Eligibility Verification',
   '[Placeholder] Employer must verify employee identity and authorization via USCIS Form I-9 within 3 business days of the first day of employment.',
   'https://www.uscis.gov/i-9', 10),
  ('US', 'Work Eligibility',          'E-Verify (If Applicable)',
   '[Placeholder] Federal contractors and some states require electronic employment eligibility verification via E-Verify. Check state law.',
   'https://www.e-verify.gov/', 20),
  ('US', 'Payroll/Tax Registration',  'Federal EIN Registration',
   '[Placeholder] Obtain an Employer Identification Number from the IRS before the first payroll run.',
   'https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers', 30),
  ('US', 'Payroll/Tax Registration',  'State Withholding and UI Accounts',
   '[Placeholder] Register with your state revenue agency for income-tax withholding and with the state workforce agency for unemployment insurance.',
   null, 40),
  ('US', 'Payroll/Tax Registration',  'Workers'' Compensation Insurance',
   '[Placeholder] Most states require employers to carry workers'' compensation coverage before hiring the first employee.',
   null, 50),
  ('US', 'Required Posters',          'Federal Labor Law Posters',
   '[Placeholder] Post federally required notices covering minimum wage, FMLA, OSHA, EEO, and polygraph protection in a visible location.',
   'https://www.dol.gov/agencies/whd/posters', 60),
  ('US', 'Required Posters',          'State Labor Law Posters',
   '[Placeholder] Post all state-mandated notices (varies by state). Contact your state labor department for the current poster set.',
   null, 70),
  ('US', 'Food Safety',               'Food Handler Permits',
   '[Placeholder] Employees who handle open food may be required to hold a food handler card issued by the local health authority.',
   null, 80),
  ('US', 'Food Safety',               'Food Manager Certification',
   '[Placeholder] Many jurisdictions require at least one certified food protection manager (e.g. ServSafe) per establishment.',
   'https://www.servsafe.com/', 90),

  -- ── United Kingdom ──
  ('GB', 'Work Eligibility',          'Right to Work Check',
   '[Placeholder] UK employers must verify an employee''s right to work in the UK before employment begins, using acceptable documents or the Home Office online service.',
   'https://www.gov.uk/check-job-applicant-right-to-work', 10),
  ('GB', 'Work Eligibility',          'DBS Check (If Applicable)',
   '[Placeholder] Roles involving vulnerable adults or children may require a Disclosure and Barring Service check.',
   'https://www.gov.uk/request-copy-criminal-record', 20),
  ('GB', 'Payroll/Tax Registration',  'PAYE Registration with HMRC',
   '[Placeholder] Register as an employer with HMRC before making the first payment. Report payroll via Real Time Information (RTI) each pay period.',
   'https://www.gov.uk/register-employer', 30),
  ('GB', 'Payroll/Tax Registration',  'National Insurance and Pension Auto-Enrolment',
   '[Placeholder] Deduct Class 1 NI contributions and auto-enrol eligible workers into a qualifying workplace pension within 6 weeks of the start date.',
   'https://www.thepensionsregulator.gov.uk/en/employers', 40),
  ('GB', 'Required Posters',          'Employer''s Liability Insurance Certificate',
   '[Placeholder] Display your employer''s liability compulsory insurance certificate where employees can easily read it.',
   'https://www.hse.gov.uk/pubns/hse39.pdf', 50),
  ('GB', 'Required Posters',          'Health and Safety Law Poster',
   '[Placeholder] Display the HSE "Health and safety law: what you need to know" poster or provide the equivalent leaflet to each worker.',
   'https://www.hse.gov.uk/pubns/books/lawposter.htm', 60),
  ('GB', 'Food Safety',               'Food Business Registration',
   '[Placeholder] Register your food business with the local authority at least 28 days before opening.',
   'https://www.food.gov.uk/business-guidance/register-a-food-business', 70),
  ('GB', 'Food Safety',               'Food Hygiene Training',
   '[Placeholder] All food handlers must receive appropriate food hygiene training commensurate with their role (Level 2 Award recommended).',
   null, 80),

  -- ── Canada ──
  ('CA', 'Work Eligibility',          'SIN and Work Authorization Verification',
   '[Placeholder] Collect the employee''s Social Insurance Number and confirm they hold a work permit or Canadian citizen/permanent-resident status before the first pay period.',
   'https://www.canada.ca/en/employment-social-development/programs/sin.html', 10),
  ('CA', 'Work Eligibility',          'Record of Employment',
   '[Placeholder] Issue a Record of Employment (ROE) via Service Canada when an employee experiences an interruption of earnings (layoff, termination, or leave).',
   'https://www.canada.ca/en/employment-social-development/programs/ui-ie/roe/user-guide.html', 20),
  ('CA', 'Payroll/Tax Registration',  'CRA Payroll Account (RP)',
   '[Placeholder] Register a payroll deductions account with the Canada Revenue Agency. Remit CPP contributions, EI premiums, and income-tax withholding each period.',
   'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/getting-started-payroll.html', 30),
  ('CA', 'Payroll/Tax Registration',  'Provincial Employer Health Tax and WCB',
   '[Placeholder] Register with the provincial workers'' compensation board (e.g. WSIB in Ontario, WorkSafeBC in BC) and pay applicable employer health tax if required.',
   null, 40),
  ('CA', 'Required Posters',          'Employment Standards Poster',
   '[Placeholder] Post the provincially mandated employment standards notice in a visible location in the workplace.',
   null, 50),
  ('CA', 'Required Posters',          'Occupational Health and Safety Notice',
   '[Placeholder] Post the provincial OHS rights-and-responsibilities notice and your workplace violence/harassment policy.',
   null, 60),
  ('CA', 'Food Safety',               'Food Handler Certification',
   '[Placeholder] At least one employee per shift is typically required to hold a provincially accredited food handler certificate.',
   null, 70),
  ('CA', 'Food Safety',               'Public Health Permit and Inspection',
   '[Placeholder] Obtain a food premises permit from the local public health unit and maintain records of inspections.',
   null, 80),

  -- ── Australia ──
  ('AU', 'Work Eligibility',          'VEVO Work Entitlement Check',
   '[Placeholder] Use the Visa Entitlement Verification Online (VEVO) service to confirm non-citizen employees hold a valid work-entitled visa.',
   'https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online', 10),
  ('AU', 'Work Eligibility',          'TFN Declaration',
   '[Placeholder] Collect a Tax File Number Declaration from each new employee within 14 days of starting, for withholding tax purposes.',
   'https://www.ato.gov.au/Forms/TFN-declaration/', 20),
  ('AU', 'Payroll/Tax Registration',  'ABN and PAYG Withholding Registration',
   '[Placeholder] Register for PAYG withholding with the ATO and withhold tax from employee pay each period. Lodge a Tax Withholding Declaration annually.',
   'https://www.ato.gov.au/business/payg-withholding/', 30),
  ('AU', 'Payroll/Tax Registration',  'Superannuation (Super Guarantee)',
   '[Placeholder] Pay the compulsory superannuation guarantee (currently 11.5% of ordinary time earnings) into each employee''s nominated super fund by the quarterly due date.',
   'https://www.ato.gov.au/business/super-for-employers/', 40),
  ('AU', 'Payroll/Tax Registration',  'Workers'' Compensation Insurance',
   '[Placeholder] Take out a workers'' compensation policy with a licensed insurer in your state or territory before employing staff.',
   null, 50),
  ('AU', 'Required Posters',          'Fair Work Information Statement',
   '[Placeholder] Give every new employee a copy of the Fair Work Information Statement before or as soon as practicable after they start.',
   'https://www.fairwork.gov.au/employment-conditions/national-employment-standards/fair-work-information-statement', 60),
  ('AU', 'Required Posters',          'Safe Work Australia Notices',
   '[Placeholder] Display relevant WHS notices as required by your state or territory WHS regulator.',
   'https://www.safeworkaustralia.gov.au/', 70),
  ('AU', 'Food Safety',               'Food Safety Supervisor Certificate',
   '[Placeholder] Each food business in most states must appoint a certified Food Safety Supervisor and ensure they are reasonably available to staff.',
   null, 80),
  ('AU', 'Food Safety',               'Council Food Business Registration',
   '[Placeholder] Register your food premises with the local council before trading and maintain the registration annually.',
   null, 90);
