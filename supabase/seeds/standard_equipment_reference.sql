-- standard_equipment_reference seed
-- 4 menu profiles × 12–18 canonical items each = 65 rows total
--
-- Sources:
--   SCA Equipment Standards (sca.coffee/resources/white-papers/equipment-standards)
--   Barista Hustle "Setting Up Your Espresso Bar" (baristahustle.com/blog/setting-up-your-espresso-bar)
--   Specialty Coffee Retailer Equipment Checklists 2024 (specialty-coffee-retailer.com/equipment)
--
-- Idempotent: ON CONFLICT (menu_profile, name_canonical) DO UPDATE
-- Run twice safely.

INSERT INTO standard_equipment_reference
  (menu_profile, category, name_canonical, must_have, rationale)
VALUES

-- ============================================================
-- PROFILE: espresso_focused
-- Espresso bar only. No batch brew program. No food.
-- 14 rows
-- ============================================================
('espresso_focused', 'espresso',      'commercial espresso machine (2-group)', true,
 'Without a 2-group espresso machine you cannot pull shots; the entire espresso menu goes offline.'),

('espresso_focused', 'grinder',       'espresso grinder (on-demand)',          true,
 'Espresso extraction requires freshly dosed, precisely ground coffee; any other method produces inconsistent shots.'),

('espresso_focused', 'espresso',      'portafilter set (3+)',                  true,
 'Rotating portafilters keep pace on a 2-group bar; fewer than 3 creates a bottleneck during any morning rush.'),

('espresso_focused', 'espresso',      'knock box',                             true,
 'Puck disposal at pace takes 3-5 seconds with a knock box; without one baristas lose station control mid-rush.'),

('espresso_focused', 'refrigeration', 'under-counter refrigerator (milk)',     true,
 'Milk must stay below 40°F per health code; absent refrigeration means no espresso drinks and an inspection fail.'),

('espresso_focused', 'plumbing',      'commercial espresso water filter',      true,
 'Scale deposits clog boilers in under a year; a water filter protects the machine and preserves extraction quality.'),

('espresso_focused', 'plumbing',      'floor drain (bar area)',                true,
 'Health codes in every US jurisdiction require a floor drain in any bar prep area for spills and cleaning water.'),

('espresso_focused', 'electrical',    'dedicated 220V circuit (espresso machine)', true,
 'A commercial 2-group draws 15-20 A at 220 V; sharing a 110 V circuit will trip breakers and shut down service.'),

('espresso_focused', 'pos',           'point-of-sale terminal',               true,
 'A POS captures every sale, enables card payments, and is required by most commercial lease reporting clauses.'),

('espresso_focused', 'pos',           'cash drawer',                          false,
 'Useful for cash customers but not critical if the shop operates card-only; most urban specialty shops operate cashless.'),

('espresso_focused', 'smallwares',    'milk steaming pitchers (4+)',           true,
 'Pitchers are consumed 1 per drink during peak; fewer than 4 creates a throttle on 2-group bar output.'),

('espresso_focused', 'smallwares',    'tamper',                               true,
 'Consistent tamping pressure (around 30 lbs) is required for even extraction; a missing tamper makes dialing in impossible.'),

('espresso_focused', 'smallwares',    'espresso cups and shot glasses',        true,
 'Serving vessels are physically required to deliver product; espresso service cannot open without them.'),

('espresso_focused', 'signage',       'overhead menu board',                  true,
 'Customers need a visible menu to order; absent overhead signage slows line speed and may violate health permit posting rules.'),


-- ============================================================
-- PROFILE: espresso_plus_brew
-- Espresso + batch brew + light pastry. Default fallback profile.
-- 16 rows
-- ============================================================
('espresso_plus_brew', 'espresso',      'commercial espresso machine (2-group)', true,
 'Without a 2-group espresso machine you cannot pull shots; the entire espresso menu goes offline.'),

('espresso_plus_brew', 'grinder',       'espresso grinder (on-demand)',          true,
 'Espresso extraction requires freshly dosed, precisely ground coffee; any other method produces inconsistent shots.'),

('espresso_plus_brew', 'espresso',      'portafilter set (3+)',                  true,
 'Rotating portafilters keep pace on a 2-group bar; fewer than 3 creates a bottleneck during any morning rush.'),

('espresso_plus_brew', 'espresso',      'knock box',                             true,
 'Puck disposal at pace takes 3-5 seconds with a knock box; without one baristas lose station control mid-rush.'),

('espresso_plus_brew', 'espresso',      'batch brewer (2L+)',                    true,
 'Batch coffee is the highest-margin drink in a brew program; without a commercial brewer the drip menu cannot open.'),

('espresso_plus_brew', 'grinder',       'batch brew grinder',                   true,
 'A dedicated batch grinder prevents cross-contamination with espresso settings and maintains recipe consistency.'),

('espresso_plus_brew', 'refrigeration', 'under-counter refrigerator (milk)',     true,
 'Milk must stay below 40°F per health code; absent refrigeration means no espresso drinks and an inspection fail.'),

('espresso_plus_brew', 'plumbing',      'commercial espresso water filter',      true,
 'Scale deposits clog boilers in under a year; a water filter protects the machine and preserves extraction quality.'),

('espresso_plus_brew', 'plumbing',      'floor drain (bar area)',                true,
 'Health codes in every US jurisdiction require a floor drain in any bar prep area for spills and cleaning water.'),

('espresso_plus_brew', 'electrical',    'dedicated 220V circuit (espresso machine)', true,
 'A commercial 2-group draws 15-20 A at 220 V; sharing a 110 V circuit will trip breakers and shut down service.'),

('espresso_plus_brew', 'pos',           'point-of-sale terminal',               true,
 'A POS captures every sale, enables card payments, and is required by most commercial lease reporting clauses.'),

('espresso_plus_brew', 'pos',           'cash drawer',                          false,
 'Useful for cash customers but not critical if the shop operates card-only; most urban specialty shops operate cashless.'),

('espresso_plus_brew', 'smallwares',    'milk steaming pitchers (4+)',           true,
 'Pitchers are consumed 1 per drink during peak; fewer than 4 creates a throttle on 2-group bar output.'),

('espresso_plus_brew', 'smallwares',    'tamper',                               true,
 'Consistent tamping pressure (around 30 lbs) is required for even extraction; a missing tamper makes dialing in impossible.'),

('espresso_plus_brew', 'smallwares',    'espresso cups and shot glasses',        true,
 'Serving vessels are physically required to deliver product; espresso service cannot open without them.'),

('espresso_plus_brew', 'signage',       'overhead menu board',                  true,
 'Customers need a visible menu to order; absent overhead signage slows line speed and may violate health permit posting rules.'),


-- ============================================================
-- PROFILE: full_drip
-- Drip program emphasis: batch brewers + grinders, airpots, pour-over capability.
-- 17 rows
-- ============================================================
('full_drip', 'espresso',      'commercial espresso machine (2-group)', true,
 'Without a 2-group espresso machine you cannot pull shots; the entire espresso menu goes offline.'),

('full_drip', 'grinder',       'espresso grinder (on-demand)',          true,
 'Espresso extraction requires freshly dosed, precisely ground coffee; any other method produces inconsistent shots.'),

('full_drip', 'espresso',      'portafilter set (3+)',                  true,
 'Rotating portafilters keep pace on a 2-group bar; fewer than 3 creates a bottleneck during any morning rush.'),

('full_drip', 'espresso',      'knock box',                             true,
 'Puck disposal at pace takes 3-5 seconds with a knock box; without one baristas lose station control mid-rush.'),

('full_drip', 'espresso',      'batch brewer (2L+)',                    true,
 'Batch coffee is the highest-margin drink in a drip program; without a commercial brewer the drip menu cannot open.'),

('full_drip', 'grinder',       'batch brew grinder',                   true,
 'A dedicated batch grinder prevents cross-contamination with espresso settings and maintains recipe consistency.'),

('full_drip', 'grinder',       'pour-over grinder',                    false,
 'A pour-over grinder supports single-origin by-the-cup service and commands premium pricing; optional if the batch grinder suffices.'),

('full_drip', 'smallwares',    'airpot set (4+)',                       true,
 'Airpots hold brewed coffee at temperature for counter dispensing; without them batch brew cannot be served during a rush.'),

('full_drip', 'refrigeration', 'under-counter refrigerator (milk)',     true,
 'Milk must stay below 40°F per health code; absent refrigeration means no espresso drinks and an inspection fail.'),

('full_drip', 'plumbing',      'commercial espresso water filter',      true,
 'Scale deposits clog boilers in under a year; a water filter protects the machine and preserves extraction quality.'),

('full_drip', 'plumbing',      'floor drain (bar area)',                true,
 'Health codes in every US jurisdiction require a floor drain in any bar prep area for spills and cleaning water.'),

('full_drip', 'electrical',    'dedicated 220V circuit (espresso machine)', true,
 'A commercial 2-group draws 15-20 A at 220 V; sharing a 110 V circuit will trip breakers and shut down service.'),

('full_drip', 'pos',           'point-of-sale terminal',               true,
 'A POS captures every sale, enables card payments, and is required by most commercial lease reporting clauses.'),

('full_drip', 'pos',           'cash drawer',                          false,
 'Useful for cash customers but not critical if the shop operates card-only; most urban specialty shops operate cashless.'),

('full_drip', 'smallwares',    'milk steaming pitchers (4+)',           true,
 'Pitchers are consumed 1 per drink during peak; fewer than 4 creates a throttle on 2-group bar output.'),

('full_drip', 'smallwares',    'tamper',                               true,
 'Consistent tamping pressure (around 30 lbs) is required for even extraction; a missing tamper makes dialing in impossible.'),

('full_drip', 'signage',       'overhead menu board',                  true,
 'Customers need a visible menu to order; absent overhead signage slows line speed and may violate health permit posting rules.'),


-- ============================================================
-- PROFILE: full_food
-- Full kitchen: espresso + batch brew + fridge/freezer/hood/3-comp sink/dish.
-- 18 rows
-- ============================================================
('full_food', 'espresso',      'commercial espresso machine (2-group)', true,
 'Without a 2-group espresso machine you cannot pull shots; the entire espresso menu goes offline.'),

('full_food', 'grinder',       'espresso grinder (on-demand)',          true,
 'Espresso extraction requires freshly dosed, precisely ground coffee; any other method produces inconsistent shots.'),

('full_food', 'espresso',      'batch brewer (2L+)',                    true,
 'Batch coffee is the highest-margin drink in a brew program; without a commercial brewer the drip menu cannot open.'),

('full_food', 'grinder',       'batch brew grinder',                   true,
 'A dedicated batch grinder prevents cross-contamination with espresso settings and maintains recipe consistency.'),

('full_food', 'refrigeration', 'under-counter refrigerator (milk)',     true,
 'Milk must stay below 40°F per health code; absent refrigeration means no espresso drinks and an inspection fail.'),

('full_food', 'refrigeration', 'commercial reach-in refrigerator',     true,
 'A reach-in is required to store food prep ingredients at volume; the under-counter milk unit alone is insufficient for a kitchen.'),

('full_food', 'refrigeration', 'commercial freezer',                   true,
 'Frozen storage is required for most food programs; without a freezer the menu is limited to ambient-stable items only.'),

('full_food', 'plumbing',      'commercial espresso water filter',      true,
 'Scale deposits clog boilers in under a year; a water filter protects the machine and preserves extraction quality.'),

('full_food', 'plumbing',      'floor drain (bar area)',                true,
 'Health codes in every US jurisdiction require a floor drain in any bar prep area for spills and cleaning water.'),

('full_food', 'plumbing',      '3-compartment sink',                   true,
 'A 3-compartment wash/rinse/sanitize sink is required by health code for any food preparation operation in all US jurisdictions.'),

('full_food', 'plumbing',      'grease trap',                          true,
 'A grease trap is required by municipal code whenever cooking grease enters the drain; inspectors shut down kitchens without one.'),

('full_food', 'plumbing',      'commercial dishwasher',                true,
 'A commercial dishwasher is required for sanitation at volume; hand-washing alone cannot keep pace with a full kitchen during service.'),

('full_food', 'electrical',    'dedicated 220V circuit (espresso machine)', true,
 'A commercial 2-group draws 15-20 A at 220 V; sharing a 110 V circuit will trip breakers and shut down service.'),

('full_food', 'ventilation',   'commercial exhaust hood (Type I)',     true,
 'A Type I exhaust hood is required by fire code above any cooking equipment; inspectors will shut down a kitchen without one.'),

('full_food', 'pos',           'point-of-sale terminal',               true,
 'A POS captures every sale, enables card payments, and is required by most commercial lease reporting clauses.'),

('full_food', 'smallwares',    'milk steaming pitchers (4+)',           true,
 'Pitchers are consumed 1 per drink during peak; fewer than 4 creates a throttle on 2-group bar output.'),

('full_food', 'smallwares',    'tamper',                               true,
 'Consistent tamping pressure (around 30 lbs) is required for even extraction; a missing tamper makes dialing in impossible.'),

('full_food', 'signage',       'overhead menu board',                  true,
 'Customers need a visible menu to order; absent overhead signage slows line speed and may violate health permit posting rules.')

ON CONFLICT (menu_profile, name_canonical) DO UPDATE SET
  category  = EXCLUDED.category,
  must_have = EXCLUDED.must_have,
  rationale = EXCLUDED.rationale;

-- Verify: SELECT menu_profile, COUNT(*) FROM standard_equipment_reference GROUP BY menu_profile ORDER BY 1;
-- Expected: espresso_focused=14, espresso_plus_brew=16, full_drip=17, full_food=18 (65 total)
