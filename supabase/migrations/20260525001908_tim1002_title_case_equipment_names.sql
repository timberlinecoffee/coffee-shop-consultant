-- TIM-1002: Title Case enforcement for label-shaped equipment names.
--
-- standard_equipment_reference seed rows currently store name_canonical in
-- lowercase ("knock box", "portafilter set (3+)"), and 15 buildout_equipment_items
-- rows on live plans were seeded directly from those values. The boundary code
-- in src/lib/text.ts will Title-Case all future writes, but the rule requires
-- seed data to be Title Case at rest — so update the existing rows here.
--
-- The new names mirror what toTitleCase() would produce: every word
-- capitalized except articles/short prepositions/conjunctions; hyphenated
-- compounds capitalize both parts; numeric/unit suffixes ("220V", "32oz",
-- "2L+", "2-group", "3+", "4+") are left as-is.

-- ── standard_equipment_reference ────────────────────────────────────────────

update public.standard_equipment_reference set name_canonical = 'Dedicated 220V Circuit (Espresso Machine)' where name_canonical = 'dedicated 220V circuit (espresso machine)';
update public.standard_equipment_reference set name_canonical = 'Batch Brewer (2L+)' where name_canonical = 'batch brewer (2L+)';
update public.standard_equipment_reference set name_canonical = 'Commercial Espresso Machine (2-Group)' where name_canonical = 'commercial espresso machine (2-group)';
update public.standard_equipment_reference set name_canonical = 'Knock Box' where name_canonical = 'knock box';
update public.standard_equipment_reference set name_canonical = 'Portafilter Set (3+)' where name_canonical = 'portafilter set (3+)';
update public.standard_equipment_reference set name_canonical = 'Batch Brew Grinder' where name_canonical = 'batch brew grinder';
update public.standard_equipment_reference set name_canonical = 'Espresso Grinder (On-Demand)' where name_canonical = 'espresso grinder (on-demand)';
update public.standard_equipment_reference set name_canonical = 'Pour-Over Grinder' where name_canonical = 'pour-over grinder';
update public.standard_equipment_reference set name_canonical = '3-Compartment Sink' where name_canonical = '3-compartment sink';
update public.standard_equipment_reference set name_canonical = 'Commercial Dishwasher' where name_canonical = 'commercial dishwasher';
update public.standard_equipment_reference set name_canonical = 'Commercial Espresso Water Filter' where name_canonical = 'commercial espresso water filter';
update public.standard_equipment_reference set name_canonical = 'Floor Drain (Bar Area)' where name_canonical = 'floor drain (bar area)';
update public.standard_equipment_reference set name_canonical = 'Grease Trap' where name_canonical = 'grease trap';
update public.standard_equipment_reference set name_canonical = 'Cash Drawer' where name_canonical = 'cash drawer';
update public.standard_equipment_reference set name_canonical = 'Point-of-Sale Terminal' where name_canonical = 'point-of-sale terminal';
update public.standard_equipment_reference set name_canonical = 'Commercial Freezer' where name_canonical = 'commercial freezer';
update public.standard_equipment_reference set name_canonical = 'Commercial Reach-In Refrigerator' where name_canonical = 'commercial reach-in refrigerator';
update public.standard_equipment_reference set name_canonical = 'Under-Counter Refrigerator (Milk)' where name_canonical = 'under-counter refrigerator (milk)';
update public.standard_equipment_reference set name_canonical = 'Overhead Menu Board' where name_canonical = 'overhead menu board';
update public.standard_equipment_reference set name_canonical = 'Airpot Set (4+)' where name_canonical = 'airpot set (4+)';
update public.standard_equipment_reference set name_canonical = 'Milk Steaming Pitchers (4+)' where name_canonical = 'milk steaming pitchers (4+)';
update public.standard_equipment_reference set name_canonical = 'Tamper' where name_canonical = 'tamper';
update public.standard_equipment_reference set name_canonical = 'Espresso Cups and Shot Glasses' where name_canonical = 'espresso cups and shot glasses';

-- ── buildout_equipment_items (live plan rows seeded before TIM-1002) ────────

update public.buildout_equipment_items set name = 'Dedicated 220V Circuit (Espresso Machine)' where name = 'dedicated 220V circuit (espresso machine)';
update public.buildout_equipment_items set name = 'Portafilter Set (3+)' where name = 'portafilter set (3+)';
update public.buildout_equipment_items set name = 'Commercial Espresso Machine (2-Group)' where name = 'commercial espresso machine (2-group)';
update public.buildout_equipment_items set name = 'Batch Brewer (2L+)' where name = 'batch brewer (2L+)';
update public.buildout_equipment_items set name = 'Knock Box' where name = 'knock box';
update public.buildout_equipment_items set name = 'Batch Brew Grinder' where name = 'batch brew grinder';
update public.buildout_equipment_items set name = 'Espresso Grinder (On-Demand)' where name = 'espresso grinder (on-demand)';
update public.buildout_equipment_items set name = 'Commercial Espresso Water Filter' where name = 'commercial espresso water filter';
update public.buildout_equipment_items set name = 'Floor Drain (Bar Area)' where name = 'floor drain (bar area)';
update public.buildout_equipment_items set name = 'Point-of-Sale Terminal' where name = 'point-of-sale terminal';
update public.buildout_equipment_items set name = 'Under-Counter Refrigerator (Milk)' where name = 'under-counter refrigerator (milk)';
update public.buildout_equipment_items set name = 'Overhead Menu Board' where name = 'overhead menu board';
update public.buildout_equipment_items set name = 'Milk Steaming Pitchers (4+)' where name = 'milk steaming pitchers (4+)';
update public.buildout_equipment_items set name = 'Tamper' where name = 'tamper';
update public.buildout_equipment_items set name = 'Espresso Cups and Shot Glasses' where name = 'espresso cups and shot glasses';
