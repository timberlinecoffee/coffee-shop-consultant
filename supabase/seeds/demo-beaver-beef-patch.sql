-- Demo data patch: fill missing Equipment, Launch, and Marketing sections
-- for the trent@simpler.coffee "Beaver & Beef" demo account.
--
-- Addresses gaps found by TIM-1553 render-verified audit (TIM-1597).
-- TIM-1554 populated Concept, Team, Menu, Financials, Operations but
-- missed these three workspaces. This script fills them idempotently.
--
-- Change summary:
--   • Equipment: 12 items inserted into buildout_equipment_items
--   • Launch:    9 milestones inserted into launch_milestones
--     (NOTE: the print page was reading launch_timeline_items — a separate old
--      table. The companion code fix in print/page.tsx switches the print page
--      to read launch_milestones so workspace data and print data are consistent.)
--   • Marketing: 1 document inserted into workspace_documents (key='marketing')
--
-- Owner: UX/UI Designer (TIM-1597)
-- Run via: Supabase SQL editor or psql against the target project.
-- Safe to re-run: DELETE+INSERT with fixed UUIDs; workspace_document uses
-- ON CONFLICT DO UPDATE.

do $$
declare
  demo_user_id uuid;
  demo_plan_id uuid;
  opening_date date := '2026-09-15';

  -- Equipment item ids (fixed for idempotency)
  eq_id_01 uuid := 'bb000001-0000-0000-0000-000000000001';
  eq_id_02 uuid := 'bb000001-0000-0000-0000-000000000002';
  eq_id_03 uuid := 'bb000001-0000-0000-0000-000000000003';
  eq_id_04 uuid := 'bb000001-0000-0000-0000-000000000004';
  eq_id_05 uuid := 'bb000001-0000-0000-0000-000000000005';
  eq_id_06 uuid := 'bb000001-0000-0000-0000-000000000006';
  eq_id_07 uuid := 'bb000001-0000-0000-0000-000000000007';
  eq_id_08 uuid := 'bb000001-0000-0000-0000-000000000008';
  eq_id_09 uuid := 'bb000001-0000-0000-0000-000000000009';
  eq_id_10 uuid := 'bb000001-0000-0000-0000-000000000010';
  eq_id_11 uuid := 'bb000001-0000-0000-0000-000000000011';
  eq_id_12 uuid := 'bb000001-0000-0000-0000-000000000012';

  -- Launch milestone ids (fixed for idempotency)
  lm_id_01 uuid := 'bb000002-0000-0000-0000-000000000001';
  lm_id_02 uuid := 'bb000002-0000-0000-0000-000000000002';
  lm_id_03 uuid := 'bb000002-0000-0000-0000-000000000003';
  lm_id_04 uuid := 'bb000002-0000-0000-0000-000000000004';
  lm_id_05 uuid := 'bb000002-0000-0000-0000-000000000005';
  lm_id_06 uuid := 'bb000002-0000-0000-0000-000000000006';
  lm_id_07 uuid := 'bb000002-0000-0000-0000-000000000007';
  lm_id_08 uuid := 'bb000002-0000-0000-0000-000000000008';
  lm_id_09 uuid := 'bb000002-0000-0000-0000-000000000009';
begin

  -- ── Resolve user + plan ─────────────────────────────────────────────────────

  select id into demo_user_id
    from auth.users
   where email = 'trent@simpler.coffee'
   limit 1;

  if demo_user_id is null then
    raise exception 'User trent@simpler.coffee not found — is this the right environment?';
  end if;

  select id into demo_plan_id
    from public.coffee_shop_plans
   where user_id = demo_user_id
     and lower(plan_name) like '%beaver%'
   order by created_at desc
   limit 1;

  if demo_plan_id is null then
    select id into demo_plan_id
      from public.coffee_shop_plans
     where user_id = demo_user_id
     order by created_at desc
     limit 1;
  end if;

  if demo_plan_id is null then
    raise exception 'No plan found for trent@simpler.coffee';
  end if;

  raise notice 'Patching plan_id: %', demo_plan_id;

  -- ── 1. Equipment items (buildout_equipment_items) ───────────────────────────
  -- Beaver & Beef: 900 sqft Calgary specialty coffee + Canadian beef sandwich shop.
  -- Phil & Sebastian supply the coffee; 22 seats; opens September 15, 2026.
  -- Consistent with the $204,060 CAD startup budget in Financials (TIM-1554 persona).

  delete from public.buildout_equipment_items
   where id in (
     eq_id_01, eq_id_02, eq_id_03, eq_id_04, eq_id_05, eq_id_06,
     eq_id_07, eq_id_08, eq_id_09, eq_id_10, eq_id_11, eq_id_12
   );

  insert into public.buildout_equipment_items
    (id, plan_id, position, name, category, vendor, model,
     quantity, unit_cost_cents, priority_tier, financing_method, source, notes)
  values
    (eq_id_01, demo_plan_id, 0,
     'La Marzocco Linea Micra (2-Group)', 'espresso_station',
     'La Marzocco', 'Linea Micra',
     1, 1850000, 'must_have', 'cash', 'user_added',
     'Primary espresso machine. Compact footprint for 900 sqft; 2-group handles morning rush. CAD price includes duty and local dealer setup fee.'),

    (eq_id_02, demo_plan_id, 1,
     'Mahlkonig E65S GbW Grinder', 'espresso_station',
     'Mahlkonig', 'E65S GbW',
     2, 280000, 'must_have', 'cash', 'user_added',
     'Two grinders: one dedicated espresso blend (Phil & Sebastian), one for decaf/single-origin. Gravimetric model reduces dose variance across a busy morning shift.'),

    (eq_id_03, demo_plan_id, 2,
     'Marco UBER Boiler Batch Brewer', 'brew_platform',
     'Marco Beverage Systems', 'UBER Boiler',
     1, 420000, 'must_have', 'cash', 'user_added',
     'Batch brewer for filter coffee and tea. Programmable brew ratios; recommended by Phil & Sebastian for single-origin filter rotation.'),

    (eq_id_04, demo_plan_id, 3,
     'True Refrigeration 48" Undercounter Refrigerator', 'refrigeration',
     'True Refrigeration', 'TUC-48-HC',
     1, 295000, 'must_have', 'cash', 'user_added',
     'Bar-height undercounter fridge for milk and dairy alternatives behind the espresso bar.'),

    (eq_id_05, demo_plan_id, 4,
     'Atosa 48" Refrigerated Sandwich Prep Table', 'refrigeration',
     'Atosa', 'MSF8306GR',
     1, 240000, 'must_have', 'cash', 'user_added',
     'Refrigerated prep table for beef sandwich assembly. Holds Whitehorse Farms beef and Sidewalk Citizen bread at safe temperature through a full lunch service.'),

    (eq_id_06, demo_plan_id, 5,
     'Atosa Commercial Reach-In Freezer', 'refrigeration',
     'Atosa', 'MBF8003GR',
     1, 185000, 'must_have', 'cash', 'user_added',
     'Back-of-house freezer for bulk beef storage. Rocky Mountain Meats delivers 2x/week; this holds the weekly buffer stock.'),

    (eq_id_07, demo_plan_id, 6,
     'Square for Restaurants — Hardware Bundle', 'pos_tech',
     'Square', 'Restaurant Starter Kit',
     2, 85000, 'must_have', 'cash', 'user_added',
     'Two terminals: one counter POS, one KDS display for sandwich build workflow. Monthly SaaS subscription included in Opex.'),

    (eq_id_08, demo_plan_id, 7,
     'Commercial Panini / Sandwich Press', 'food_prep',
     'Waring', 'WPG250B',
     2, 55000, 'must_have', 'cash', 'user_added',
     'Two presses for back-to-back sandwich volume at peak. Warm beef and toasted Sidewalk Citizen bread is the signature item.'),

    (eq_id_09, demo_plan_id, 8,
     'Panasonic Commercial Microwave', 'food_prep',
     'Panasonic', 'NE-1025F',
     1, 38000, 'must_have', 'cash', 'user_added',
     'Rapid warming for beef portions. Complements the press without requiring a full hood or ventilation upgrade.'),

    (eq_id_10, demo_plan_id, 9,
     'Rhino Coffee Gear Pro Bar Kit', 'smallwares',
     'Rhino Coffee Gear', 'Pro Bar Kit',
     1, 65000, 'must_have', 'cash', 'user_added',
     'Knock box, tamper mat, shot glasses, WDT tool, milk pitchers (4), thermometers, and bar cleaning brushes.'),

    (eq_id_11, demo_plan_id, 10,
     'Counter Height Bar Stools (Set Of 8)', 'furniture_fixtures',
     'Inglewood Habitat Restore', null,
     8, 18000, 'must_have', 'cash', 'user_added',
     'Reclaimed-wood bar stools consistent with Beaver & Beef industrial-Canadian identity. 8 seats at window bar.'),

    (eq_id_12, demo_plan_id, 11,
     'Cafe Tables And Chairs — 4-Top Sets', 'furniture_fixtures',
     'IKEA Calgary', 'GAMLEBY',
     4, 22000, 'must_have', 'cash', 'user_added',
     'Four 4-top sets for main floor (16 seats). Paired with bar stools = 22 total seats matching the lease plan.');

  -- ── 2. Launch milestones (launch_milestones) ─────────────────────────────────
  -- NOTE: The companion code fix in print/page.tsx switches the business-plan
  -- print page from reading launch_timeline_items to launch_milestones — the
  -- table the workspace UI writes to (see _loader.ts). These rows are inserted
  -- into launch_milestones so both the workspace and the print view are consistent.
  --
  -- Target opening date: September 15, 2026. Dates below follow SCA pre-open
  -- timeline anchored to that date.

  delete from public.launch_milestones
   where id in (
     lm_id_01, lm_id_02, lm_id_03, lm_id_04,
     lm_id_05, lm_id_06, lm_id_07, lm_id_08, lm_id_09
   );

  insert into public.launch_milestones
    (id, plan_id, title, description, track, target_date, status,
     owner, source, order_index, critical_path)
  values

    (lm_id_01, demo_plan_id,
     'Register business entity (AB numbered company) + obtain BN from CRA',
     'Jordan MacLeod incorporated May 18, 2026. Business Number issued. GST account registered. Required before lease signing or payroll.',
     'legal_compliance',
     opening_date - interval '120 days', 'done',
     'Jordan MacLeod', 'user_added', 0, true),

    (lm_id_02, demo_plan_id,
     'Sign 5-year lease at 1207 9 Ave SE, Inglewood',
     'Lease signed June 17, 2026. $4,200/month base NNN + $680 CAM. 5-year term with renewal option. Keys received same day.',
     'real_estate_buildout',
     opening_date - interval '90 days', 'done',
     'Jordan MacLeod', 'user_added', 1, true),

    (lm_id_03, demo_plan_id,
     'Submit development permit + health permit applications to City of Calgary',
     'Applications submitted to City of Calgary Planning + Development and AHS. Typical review window: 6–8 weeks.',
     'legal_compliance',
     opening_date - interval '88 days', 'done',
     'Jordan MacLeod / GC', 'user_added', 2, true),

    (lm_id_04, demo_plan_id,
     'Place equipment orders: La Marzocco Linea Micra, Mahlkonig grinders, refrigeration',
     'La Marzocco ordered via The Espresso Company (Calgary dealer). Mahlkonig E65S GbW x2 ordered. Atosa fridges on order through Nella Distributing. Lead times: espresso machine 6–8 weeks, grinders 2–3 weeks.',
     'equipment',
     opening_date - interval '60 days', 'in_progress',
     'Jordan MacLeod', 'user_added', 3, true),

    (lm_id_05, demo_plan_id,
     'Complete buildout: bar millwork, electrical rough-in, plumbing for espresso',
     'GC: Cornerstone Construction (Inglewood). Bar millwork in progress. 200A electrical panel upgrade complete. 3/4" water line stubbed to espresso machine position.',
     'real_estate_buildout',
     opening_date - interval '45 days', 'in_progress',
     'Cornerstone Construction', 'user_added', 4, true),

    (lm_id_06, demo_plan_id,
     'Complete first-round hiring: lead barista + sandwich prep lead',
     'Job posts on Indeed and local Calgary coffee community boards. Targeting 1 barista trainer + 1 BOH prep lead. Pre-open training window is 4 weeks — hire by Aug 16 to make the schedule.',
     'people_hiring',
     opening_date - interval '30 days', 'not_started',
     'Jordan MacLeod', 'user_added', 5, false),

    (lm_id_07, demo_plan_id,
     'Permits approved; equipment installed and commissioned; health inspection passed',
     'AHS inspector walk-through scheduled for Sept 1. Espresso machine calibration with Phil & Sebastian tech rep same day. 2-week buffer for punch-list items before soft open.',
     'legal_compliance',
     opening_date - interval '14 days', 'not_started',
     'Jordan MacLeod / GC', 'user_added', 6, true),

    (lm_id_08, demo_plan_id,
     'Soft open — friends, family, and Inglewood neighbourhood preview',
     'Invite-only day for 50 guests. Test full menu: espresso bar + beef sandwiches. POS live. Feedback on service flow and sandwich build times. Target: zero order errors.',
     'pre_launch_events',
     opening_date - interval '7 days', 'not_started',
     'Full team', 'user_added', 7, false),

    (lm_id_09, demo_plan_id,
     'Grand opening — first day of public service at Beaver & Beef',
     'Jordan and full team. Instagram announcement live Sept 12. Local press outreach to Avenue Calgary and Curiocity sent Sept 10. Staff ratio 3:1 for opening week to absorb volume.',
     'pre_launch_events',
     opening_date, 'not_started',
     'Full team', 'user_added', 8, true);

  -- ── 3. Marketing document (workspace_documents, workspace_key='marketing') ──
  -- Four sections as defined in lib/marketing.ts: overview, channels, story, pre_launch.
  -- Content consistent with the Beaver & Beef persona from TIM-1554.

  insert into public.workspace_documents (plan_id, workspace_key, content)
  values (
    demo_plan_id,
    'marketing',
    jsonb_build_object(
      'overview', jsonb_build_object(
        'narrative', 'Beaver & Beef is a word-of-mouth-first brand. Inglewood is a tight-knit, food-proud neighbourhood — we earn every customer through what is in the cup and on the plate, not ad spend. The strategy is built on three pillars: a strong Google Business Profile to capture local search, a consistent Instagram presence that shows the craft and the cheeky Canadian identity, and deep community roots through partnerships with Inglewood businesses and events. Pre-launch, we focus on building an email list of 250+ subscribers before opening day so we have a direct channel that does not depend on a social algorithm.'
      ),
      'channels', jsonb_build_object(
        'selected', jsonb_build_array(
          jsonb_build_object('name', 'Instagram', 'notes', 'Primary channel. 3 posts per week: espresso process, beef sandwich builds, neighbourhood stories. Stories daily for behind-the-scenes and specials. Target 1,000 followers by opening day.'),
          jsonb_build_object('name', 'Google Business Profile', 'notes', 'Claimed and fully built out. 500+ photos of space, menu, and team. Respond to every review within 24 hours. Critical for local search and map placement.'),
          jsonb_build_object('name', 'Email Newsletter', 'notes', 'Monthly email to subscriber list. Opening day countdown, menu previews, and seasonal specials. Mailchimp free tier to start; upgrade when list exceeds 500.'),
          jsonb_build_object('name', 'Local Press', 'notes', 'Outreach to Avenue Calgary, Curiocity, and the Inglewood Sunridge BIA newsletter. Target coverage tied to grand opening.'),
          jsonb_build_object('name', 'Community Events', 'notes', 'Inglewood Sunridge BIA events: Night Market, Sunday Promenade. Presence at 2 events before opening to build recognition before the doors open.'),
          jsonb_build_object('name', 'Word Of Mouth', 'notes', 'The long game. Quality drives it. Every soft-open guest is a potential brand ambassador. Give them a reason to tell their friends before opening week.')
        )
      ),
      'story', jsonb_build_object(
        'founder_story', 'Jordan MacLeod grew up watching their parents run a deli in Red Deer. After a decade in oil-and-gas project management, Jordan spent a year in Phil & Sebastian''s barista training programme and realized the two passions — great coffee and great Canadian meat — did not have to live in separate buildings. Beaver & Beef is the shop Jordan wanted to walk into every morning and could never find.',
        'origin', 'The name came from a conversation at a Calgary Stampede breakfast. A friend joked that the most honest Canadian branding would just say what it is. Beaver for the national symbol and the earnest hard-working spirit. Beef because Calgary. Beef because Rocky Mountain Meats raises it 90 minutes from the shop. The cheeky name earns a second look; the product earns the return visit.',
        'differentiator', 'No other specialty coffee shop in Inglewood serves a full beef sandwich menu built on locally sourced Canadian beef. Phil & Sebastian coffee anchors the morning crowd. The sandwich menu anchors the lunch crowd. Together they justify the 7am–5pm window and a $14.80 average ticket — well above a coffee-only shop in the same market.',
        'target_customer', 'Working professionals and tradespeople in Inglewood, Ramsay, and Scotiabank Saddledome-adjacent offices. Ages 28–50. They want craft coffee without pretension and a real lunch that is not a sad desk salad. They are proud of buying local and will tell their colleagues where they eat. Secondary: weekend foot traffic from the Inglewood antique district and 9 Ave SE restaurant row.'
      ),
      'pre_launch', jsonb_build_object(
        'milestones', jsonb_build_array(
          jsonb_build_object('id', 'bb_mktg_01', 'label', 'Claim Google Business Profile and upload 50 photos', 'target_date', '2026-08-01', 'notes', 'Photos: exterior, bar build, espresso machine, Phil & Sebastian beans, beef prep. Done before any Instagram posts so search is indexed before the account goes public.', 'completed', true),
          jsonb_build_object('id', 'bb_mktg_02', 'label', 'Launch Instagram account and post first 9 grid photos', 'target_date', '2026-08-15', 'notes', 'Brand photography session with Calgary photographer. 9-photo grid establishes the visual identity. Aim for 200 followers before soft open.', 'completed', false),
          jsonb_build_object('id', 'bb_mktg_03', 'label', 'Email list to 250 subscribers pre-opening', 'target_date', '2026-09-12', 'notes', 'Collect via Instagram link-in-bio, Inglewood BIA events, and QR card at Phil & Sebastian locations. 250 is the threshold for the opening-day announcement email.', 'completed', false),
          jsonb_build_object('id', 'bb_mktg_04', 'label', 'Send press kit to Avenue Calgary and Curiocity', 'target_date', '2026-09-10', 'notes', 'Include: concept summary, founding story, high-res photos, opening date, and a quote from Jordan. Target: one editorial feature before or within the first week.', 'completed', false),
          jsonb_build_object('id', 'bb_mktg_05', 'label', 'Soft-open guest list invitations sent', 'target_date', '2026-09-06', 'notes', 'Direct Instagram DM and email invite to 50 guests: friends, family, Inglewood neighbours, Phil & Sebastian staff. RSVP via Google Form.', 'completed', false),
          jsonb_build_object('id', 'bb_mktg_06', 'label', 'Grand opening Instagram announcement post live', 'target_date', '2026-09-12', 'notes', 'One strong post with opening date, hours, address, and a 15-second Reel showing the espresso pull and sandwich build. Boosted post: $50 CAD geo-targeted to Inglewood/Ramsay/Mission postal codes.', 'completed', false)
        )
      ),
      'last_generated_at', null
    )
  )
  on conflict (plan_id, workspace_key) do update set
    content    = excluded.content,
    updated_at = now();

  raise notice 'Patch complete for plan %: 12 equipment items, 9 launch milestones, 1 marketing document.',
    demo_plan_id;

end $$;
