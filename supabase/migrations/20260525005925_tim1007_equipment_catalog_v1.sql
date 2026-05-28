-- TIM-1007: Drop old standard_equipment_reference rows and re-seed from 115-item v1.0 catalog.
-- Extends schema: type (equipment/fund), models TEXT[], price ranges,
-- budget ranges (fund items), bundled_with, sort_order.
-- Drops menu_profile (replaced by models[]). Renames rationale -> notes.

-- ── Schema changes (no constraints yet) ──────────────────────────────────────

ALTER TABLE public.standard_equipment_reference
  DROP CONSTRAINT IF EXISTS standard_equipment_reference_menu_profile_name_canonical_key;

DROP INDEX IF EXISTS public.standard_equipment_reference_menu_profile_idx;

ALTER TABLE public.standard_equipment_reference
  RENAME COLUMN rationale TO notes;

ALTER TABLE public.standard_equipment_reference
  DROP COLUMN IF EXISTS menu_profile;

ALTER TABLE public.standard_equipment_reference
  ADD COLUMN IF NOT EXISTS type        TEXT    NOT NULL DEFAULT 'equipment'
    CHECK (type IN ('equipment', 'fund')),
  ADD COLUMN IF NOT EXISTS models      TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_low   INTEGER,
  ADD COLUMN IF NOT EXISTS price_mid   INTEGER,
  ADD COLUMN IF NOT EXISTS price_high  INTEGER,
  ADD COLUMN IF NOT EXISTS budget_low  INTEGER,
  ADD COLUMN IF NOT EXISTS budget_mid  INTEGER,
  ADD COLUMN IF NOT EXISTS budget_high INTEGER,
  ADD COLUMN IF NOT EXISTS bundled_with TEXT,
  ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0;

-- Expand buildout_equipment_items category constraint
ALTER TABLE public.buildout_equipment_items
  DROP CONSTRAINT IF EXISTS buildout_equipment_items_category_check;

ALTER TABLE public.buildout_equipment_items
  ADD CONSTRAINT buildout_equipment_items_category_check
  CHECK (category IN (
    'espresso_platform','brew_platform','milk_beverage_prep','refrigeration',
    'plumbing_water','electrical','pos_tech','furniture_fixtures','signage_decor',
    'smallwares','ceramics','glassware','to_go_ware','miscellaneous',
    'cold_beverage','cleaning_sanitation','food_prep','tech_back_office',
    'mobile_specific','drive_thru_specific','roastery_specific',
    'espresso','grinder','plumbing','furniture','pos','signage','other'
  ));

-- ── Clear old rows first ──────────────────────────────────────────────────────
DELETE FROM public.standard_equipment_reference;

-- ── Now safe to add unique constraint and index ───────────────────────────────
ALTER TABLE public.standard_equipment_reference
  ADD CONSTRAINT standard_equipment_reference_name_canonical_key
  UNIQUE (name_canonical);

CREATE INDEX IF NOT EXISTS standard_equipment_reference_models_idx
  ON public.standard_equipment_reference USING GIN (models);

-- ── Seed: 115-item v1.0 catalog + 3 bundled research items ───────────────────

INSERT INTO public.standard_equipment_reference
  (name_canonical, category, type, must_have, models, price_low, price_mid, price_high,
   budget_low, budget_mid, budget_high, notes, bundled_with, sort_order)
VALUES
('Commercial Espresso Machine (2-Group)','espresso_platform','equipment',true,ARRAY['FC','KI','DT','RC','DW'],3500,9000,22000,NULL,NULL,NULL,'2-group covers most service volumes. Portafilters, steam wands, drip tray bundled.',NULL,10),
('Commercial Espresso Machine (1-Group)','espresso_platform','equipment',true,ARRAY['MO','KI'],2000,5500,12000,NULL,NULL,NULL,'Right-sized for mobile cart or very low volume kiosk.',NULL,11),
('Espresso Grinder - Primary','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],800,2200,4500,NULL,NULL,NULL,'One per group head standard.',NULL,12),
('Espresso Grinder - Secondary (Decaf)','espresso_platform','equipment',false,ARRAY['FC','KI','DT','RC','DW'],600,1500,3000,NULL,NULL,NULL,'Prevents cross-contamination of decaf and specialty lots.',NULL,13),
('Precision Tamper (58mm)','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],45,140,220,NULL,NULL,NULL,'Manufacturer tampers are unstandardized; baristas need calibrated 58mm tamper.',NULL,14),
('Distribution Tool / Leveler','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],30,70,180,NULL,NULL,NULL,'Evens coffee bed before tamping; reduces channeling.',NULL,15),
('WDT Tool','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],15,40,120,NULL,NULL,NULL,'Breaks up clumps in ground coffee; improves extraction consistency.',NULL,16),
('Dosing Funnel / Portafilter Collar','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],12,30,60,NULL,NULL,NULL,'Reduces grind scatter; 58mm standard.',NULL,17),
('Knock Box','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],25,75,220,NULL,NULL,NULL,'Used puck disposal; countertop or drawer-mount.',NULL,18),
('Espresso Scale (with Timer)','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],50,130,250,NULL,NULL,NULL,'Precision dose-in / yield-out measurement.',NULL,19),
('Puck Screens','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],5,15,45,NULL,NULL,NULL,'Improves shower screen life. Buy 2-3 per group.',NULL,20),
('Water Filtration System','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],150,500,1500,NULL,NULL,NULL,'Machine warranty requires softened/filtered water; countertop inline housing.',NULL,21),
('Descaling / Backflush Detergent','espresso_platform','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],15,25,50,NULL,NULL,NULL,'Initial 3-month supply. Urnex Cafiza, Puly Caff.',NULL,22),
('RDT Spray Bottle','espresso_platform','equipment',false,ARRAY['FC','KI','DT','MO','RC','DW'],8,22,45,NULL,NULL,NULL,'Adds single water drop to beans before grinding; eliminates static.',NULL,23),
('Shot Glass Set (Spouted)','espresso_platform','equipment',false,ARRAY['FC','KI','DT','MO','RC','DW'],15,35,80,NULL,NULL,NULL,'Used during dialing-in; 30ml and 60ml sizes. Not for service.',NULL,24),
('Portafilter Set','espresso_platform','equipment',false,ARRAY['FC','KI','DT','MO','RC','DW'],NULL,NULL,NULL,NULL,NULL,NULL,'Bundled with every commercial espresso machine.','Commercial Espresso Machine (2-Group)',99),
('Steam Wand','espresso_platform','equipment',false,ARRAY['FC','KI','DT','MO','RC','DW'],NULL,NULL,NULL,NULL,NULL,NULL,'Integral component; bundled with espresso machine.','Commercial Espresso Machine (2-Group)',99),
('Drip Tray and Grid','espresso_platform','equipment',false,ARRAY['FC','KI','DT','MO','RC','DW'],NULL,NULL,NULL,NULL,NULL,NULL,'Bundled with every commercial espresso machine.','Commercial Espresso Machine (2-Group)',99),
('Commercial Batch Brewer','brew_platform','equipment',true,ARRAY['FC','BO','DT','RC','DW'],500,1400,3500,NULL,NULL,NULL,'Handles high-volume drip. Brew funnel, sprayhead, cradle bundled.',NULL,100),
('Thermal Coffee Server / Airpot','brew_platform','equipment',true,ARRAY['FC','BO','DT','RC','DW'],35,75,180,NULL,NULL,NULL,'Holds brewed coffee; 1.9L-3.8L. Not always bundled with brewer.',NULL,101),
('Gooseneck Kettle (Electric)','brew_platform','equipment',true,ARRAY['FC','BO','MO','RC'],45,160,280,NULL,NULL,NULL,'Pour-over precision brewing.',NULL,102),
('Pour-Over Drippers (Set of 4)','brew_platform','equipment',true,ARRAY['FC','BO','MO','RC'],60,150,300,NULL,NULL,NULL,'Hario V60, Chemex, Kalita Wave.',NULL,103),
('Brew Scale (Batch and Pour-Over)','brew_platform','equipment',true,ARRAY['FC','BO','MO','RC','DW'],30,90,220,NULL,NULL,NULL,'Larger platform than espresso scale. Separate purchase.',NULL,104),
('Ambient Water Server / Water Tower','brew_platform','equipment',false,ARRAY['FC','BO','RC'],100,250,700,NULL,NULL,NULL,'Chilled/ambient water for customer service tables.',NULL,105),
('Coffee Bean Storage Bins / Canisters (Bar)','brew_platform','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],20,60,200,NULL,NULL,NULL,'Airtight storage at bar for active grind.',NULL,106),
('French Press Set','brew_platform','equipment',false,ARRAY['RC','BO','FC'],30,80,200,NULL,NULL,NULL,'Retail demo brewing and cupping.',NULL,107),
('Siphon / Vacuum Brewer','brew_platform','equipment',false,ARRAY['RC'],80,200,500,NULL,NULL,NULL,'Roastery showpiece brew method; not required for most models.',NULL,108),
('Milk Steaming Pitcher Set','milk_beverage_prep','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],60,120,250,NULL,NULL,NULL,'12oz x 4, 20oz x 4; buy 8 minimum for busy bar.',NULL,200),
('Steam Wand Cleaning Cloth Set','milk_beverage_prep','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],15,35,80,NULL,NULL,NULL,'Color-coded towels; separate from general wipe-down cloths.',NULL,201),
('Steam Wand Cleaning Brush','milk_beverage_prep','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],6,15,30,NULL,NULL,NULL,'Removes dried milk from steam wand tip; not fully bundled.',NULL,202),
('Milk Thermometer','milk_beverage_prep','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],8,25,75,NULL,NULL,NULL,'Training tool and backup temp check.',NULL,203),
('Commercial High-Speed Blender','milk_beverage_prep','equipment',true,ARRAY['FC','KI','DT','RC','DW'],250,750,1600,NULL,NULL,NULL,'For frappes, smoothies, matcha blends. Container bundled.',NULL,204),
('Blender Sound Enclosure','milk_beverage_prep','equipment',true,ARRAY['FC','KI','DT','RC','DW'],150,320,700,NULL,NULL,NULL,'Required in customer-facing spaces; not bundled with blender.',NULL,205),
('Syrup Pump Rack / Organizer','milk_beverage_prep','equipment',true,ARRAY['FC','KI','DT','RC','DW'],30,100,300,NULL,NULL,NULL,'Holds 4-12 syrup bottles with pumps.',NULL,206),
('Syrup Dispenser Pumps (Set of 10)','milk_beverage_prep','equipment',true,ARRAY['FC','KI','DT','RC','DW'],60,120,200,NULL,NULL,NULL,'1 pump per syrup flavor.',NULL,207),
('Citrus Juicer (Electric)','milk_beverage_prep','equipment',false,ARRAY['FC','RC'],100,400,1500,NULL,NULL,NULL,'Fresh juice program.',NULL,208),
('Pitcher Rinser (Countertop)','milk_beverage_prep','equipment',true,ARRAY['FC','KI','DT','RC','DW'],35,90,200,NULL,NULL,NULL,'Rapid cold-water rinse of pitchers between drinks.',NULL,209),
('Commercial Ice Machine','cold_beverage','equipment',true,ARRAY['FC','KI','DT','RC','DW'],1200,3200,9000,NULL,NULL,NULL,'Right-size to daily volume; undersizing is the #1 mistake.',NULL,300),
('Ice Storage Bin','cold_beverage','equipment',true,ARRAY['FC','KI','DT','RC','DW'],120,350,800,NULL,NULL,NULL,'Check manufacturer - some machines ship with bin, most do not.',NULL,301),
('Ice Scoop Set (Stainless)','cold_beverage','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],10,25,50,NULL,NULL,NULL,'Health code: never use a cup to scoop ice. Buy 2 per station.',NULL,302),
('Cold Brew Immersion System','cold_beverage','equipment',false,ARRAY['FC','BO','RC'],60,350,1200,NULL,NULL,NULL,'Large-batch steeping. Toddy Commercial Kit or 5-gallon food-safe buckets.',NULL,303),
('Nitro Cold Brew System','cold_beverage','equipment',false,ARRAY['FC','RC'],400,1000,3500,NULL,NULL,NULL,'Nitrogen keg, dual-gauge regulator, stainless beer line, Perlick faucet.',NULL,304),
('Cold Brew Kegs (Set of 3)','cold_beverage','equipment',false,ARRAY['FC','RC'],150,350,700,NULL,NULL,NULL,'5-gallon stainless corny kegs; ball lock preferred for cold brew.',NULL,305),
('Iced Tea / Cold Beverage Dispenser','cold_beverage','equipment',false,ARRAY['FC','DT','DW'],80,200,600,NULL,NULL,NULL,'For pre-made iced teas, lemonades.',NULL,306),
('Under-Counter Bar Refrigerator','refrigeration','equipment',true,ARRAY['FC','KI','DT','RC','DW'],800,2200,5000,NULL,NULL,NULL,'Primary milk and cold ingredient storage at bar. 27-48 inch.',NULL,400),
('Upright Display Refrigerator / Grab-and-Go Case','refrigeration','equipment',false,ARRAY['FC','RC'],800,2500,7000,NULL,NULL,NULL,'Retail pastries, RTD beverages, packaged goods.',NULL,401),
('Chest or Upright Freezer','refrigeration','equipment',false,ARRAY['FC','DT','RC','DW'],400,900,2500,NULL,NULL,NULL,'Frozen fruit, backup ice, frozen pastries.',NULL,402),
('Back-of-House Prep Refrigerator (2-Door)','refrigeration','equipment',false,ARRAY['FC','RC'],1200,2500,5500,NULL,NULL,NULL,'Full-service and roastery need extra cold storage for food prep.',NULL,403),
('Milk Crate / Cambro Stack System','refrigeration','equipment',true,ARRAY['FC','KI','DT','BO','RC','DW'],40,120,300,NULL,NULL,NULL,'Organized milk rotation and storage.',NULL,404),
('Refrigerator Thermometer (Wireless)','refrigeration','equipment',true,ARRAY['FC','KI','DT','RC','DW'],10,25,75,NULL,NULL,NULL,'Health code compliance - cold chain logging. Not bundled.',NULL,405),
('Sanitizer Buckets (Color-Coded Set of 3)','cleaning_sanitation','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],25,50,90,NULL,NULL,NULL,'Wash / rinse / sanitize rotation; NSF color-coded.',NULL,500),
('Quaternary Sanitizer Solution','cleaning_sanitation','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],20,40,80,NULL,NULL,NULL,'Initial 1-month supply. Mix to 200 ppm per health code.',NULL,501),
('Bar Mop Towel Set (24-Pack)','cleaning_sanitation','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],25,50,100,NULL,NULL,NULL,'Dedicated bar mops vs customer-facing napkins. Commercial grade.',NULL,502),
('Group Head Cleaning Brush Set','cleaning_sanitation','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],10,25,50,NULL,NULL,NULL,'One basic brush bundled; additional set needed for thorough cleaning.',NULL,503),
('Steam Wand Milk Rinser / Soak Container','cleaning_sanitation','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],10,20,40,NULL,NULL,NULL,'Small container with dilute cleaner for steam wand tip soaking.',NULL,504),
('Commercial Mop, Bucket, and Wringer Set','cleaning_sanitation','equipment',true,ARRAY['FC','KI','DT','BO','RC','DW'],40,100,250,NULL,NULL,NULL,'Wet and dry mop system. Mobile carts may not need full system.',NULL,505),
('Spray Bottles (Color-Coded Set of 6)','cleaning_sanitation','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],12,25,50,NULL,NULL,NULL,'Food-safe labeling: all-purpose cleaner, glass cleaner, sanitizer.',NULL,506),
('Grinder Cleaning Tablets','cleaning_sanitation','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],10,20,40,NULL,NULL,NULL,'Initial stock. Run through grinder weekly to remove coffee oils.',NULL,507),
('Hand Sanitizer Dispenser (Countertop)','cleaning_sanitation','equipment',false,ARRAY['FC','KI','DT','DW','RC'],25,60,150,NULL,NULL,NULL,'Customer-facing; codes may require it. Touchless preferred.',NULL,508),
('Waste Bin Set (Front and Back of House)','cleaning_sanitation','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],40,120,300,NULL,NULL,NULL,'Stainless step-cans (back), decorative/branded (front).',NULL,509),
('Bar Mat / Anti-Fatigue Mat Set','smallwares','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],30,80,200,NULL,NULL,NULL,'Rubber drip mat for espresso station + anti-fatigue mat for barista area.',NULL,600),
('Drip Mat / Knock Box Drip Pad','smallwares','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],10,25,60,NULL,NULL,NULL,'Catches drips from pitchers and portafilters.',NULL,601),
('Barista Spoon / Long Bar Spoon Set','smallwares','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],15,35,80,NULL,NULL,NULL,'Stirring, layering drinks. Set of 6.',NULL,602),
('Measuring Cup / Jigger Set','smallwares','equipment',true,ARRAY['FC','KI','DT','MO','RC','DW'],12,30,70,NULL,NULL,NULL,'For syrups, sauces. Stainless, multiple sizes.',NULL,603),
('Permanent Marker / Chalk Marker Set','smallwares','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],8,20,40,NULL,NULL,NULL,'Date labeling, cup marking for drive-thru; chalky markers for chalkboards.',NULL,604),
('Food Storage Wrap / Labels','smallwares','equipment',false,ARRAY['FC','DT','RC','DW'],15,40,80,NULL,NULL,NULL,'Cling wrap, aluminum foil, dissolvable food-safe labels. Initial stock.',NULL,605),
('Tray Set (Service and Bussing)','smallwares','equipment',false,ARRAY['FC','BO','RC'],40,100,250,NULL,NULL,NULL,'12-14 inch oval or rectangular for table delivery and bussing.',NULL,606),
('Speed Rail / Bar Rail','smallwares','equipment',true,ARRAY['FC','KI','DT','RC','DW'],30,80,200,NULL,NULL,NULL,'Holds syrups, sauce bottles in reach at bar. 24-36 inch stainless rails.',NULL,607),
('POS Terminal Hardware (iPad + Enclosure)','pos_tech','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],400,800,2000,NULL,NULL,NULL,'Hardware only. Software subscription excluded.',NULL,700),
('Receipt Printer (Thermal)','pos_tech','equipment',true,ARRAY['FC','KI','DT','BO','RC','DW'],100,220,450,NULL,NULL,NULL,'Not bundled with POS. Drive-thru models need weather-rated units.',NULL,701),
('Drink Label Printer','pos_tech','equipment',true,ARRAY['DT','KI','FC','DW'],100,280,700,NULL,NULL,NULL,'Labels cups for drive-thru and high-volume bar.',NULL,702),
('Cash Drawer','pos_tech','equipment',true,ARRAY['FC','KI','DT','BO','RC','DW'],50,100,250,NULL,NULL,NULL,'Not bundled. Connects via receipt printer.',NULL,703),
('Payment Terminal / Card Reader','pos_tech','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],50,350,800,NULL,NULL,NULL,'Hardware only; processing fees are recurring.',NULL,704),
('Customer-Facing Display Screen','pos_tech','equipment',false,ARRAY['FC','DT','DW','RC'],100,350,700,NULL,NULL,NULL,'Shows order total to customer.',NULL,705),
('Tip Jar','pos_tech','equipment',true,ARRAY['FC','KI','BO','MO','RC'],8,25,60,NULL,NULL,NULL,'Mason jar or branded acrylic.',NULL,706),
('Queue Stanchions / Barrier Set','pos_tech','equipment',false,ARRAY['FC','DW'],100,300,700,NULL,NULL,NULL,'Crowd management. 4-6 post set with retractable belts.',NULL,707),
('Drive-Thru Headset / Intercom System','pos_tech','equipment',true,ARRAY['DT','DW'],400,1800,6000,NULL,NULL,NULL,'Base station + 2-4 headsets. HME, Panasonic, or PAX2 systems.',NULL,708),
('To-Go Order Shelf / Staging Rack','pos_tech','equipment',true,ARRAY['FC','DT','KI','DW'],40,120,350,NULL,NULL,NULL,'Holds completed drinks for pickup.',NULL,709),
('Ceramics Fund','ceramics','fund',true,ARRAY['FC','BO','RC','KI'],NULL,NULL,NULL,500,2500,6000,'Espresso cups, cappuccino cups, cafe latte cups, mugs, saucers. Budget 2x seat count + backup.',NULL,800),
('Glassware Fund','glassware','fund',false,ARRAY['FC','BO','RC'],NULL,NULL,NULL,200,900,3000,'Cold brew glasses, water glasses, cortado glasses, Irish coffee glasses.',NULL,801),
('To-Go Ware Opening Stock Fund','to_go_ware','fund',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],NULL,NULL,NULL,600,2000,5000,'Hot cups (8/12/16/20oz), cold cups, lids, sleeves, straws, napkins, stir sticks, bags. 2-4 week supply.',NULL,802),
('Refrigerated Sandwich / Prep Table','food_prep','equipment',false,ARRAY['FC','RC'],1200,3000,7500,NULL,NULL,NULL,'For food assembly. NSF certified.',NULL,900),
('Commercial Convection Oven','food_prep','equipment',false,ARRAY['FC','RC'],500,1500,5000,NULL,NULL,NULL,'Baking pastries, heating items.',NULL,901),
('Rapid Cook Oven (Microwave + Convection)','food_prep','equipment',false,ARRAY['FC','DT','DW'],800,3500,7000,NULL,NULL,NULL,'TurboChef Fire or Merrychef eikon e2s. High-speed for drive-thru food.',NULL,902),
('Panini Press / Sandwich Grill','food_prep','equipment',false,ARRAY['FC','RC'],100,300,800,NULL,NULL,NULL,'Simpler alternative to oven for toasted items.',NULL,903),
('Commercial Toaster (4-Slot or Conveyor)','food_prep','equipment',false,ARRAY['FC','DT'],80,250,900,NULL,NULL,NULL,'Conveyor for high-volume drive-thru food programs.',NULL,904),
('Food-Safe Storage Containers Set','food_prep','equipment',false,ARRAY['FC','RC'],60,150,400,NULL,NULL,NULL,'Gastronorm pans, cambro containers with lids. Colored lids for allergen coding.',NULL,905),
('Food Portion Scale','food_prep','equipment',false,ARRAY['FC','RC'],25,70,180,NULL,NULL,NULL,'Separate from espresso scale.',NULL,906),
('Hot Holding Display Case','food_prep','equipment',false,ARRAY['FC'],250,700,2500,NULL,NULL,NULL,'Warms pastries and food items for grab-and-go.',NULL,907),
('Food Prep Cutting Boards (Color-Coded)','food_prep','equipment',false,ARRAY['FC','RC'],50,120,300,NULL,NULL,NULL,'NSF color-code: green (produce), yellow (poultry). Poly, not wood.',NULL,908),
('Chef''s Knife / Serrated Knife Set','food_prep','equipment',false,ARRAY['FC','RC'],40,150,400,NULL,NULL,NULL,'2-3 knives minimum for food prep.',NULL,909),
('Dining Tables Fund','furniture_fixtures','fund',false,ARRAY['FC','BO','RC'],NULL,NULL,NULL,500,3000,12000,'Used furniture saves 60-70%.',NULL,1000),
('Dining Chairs Fund','furniture_fixtures','fund',false,ARRAY['FC','BO','RC'],NULL,NULL,NULL,400,2500,10000,'Allow 4-6 chairs per table plus extras.',NULL,1001),
('Bar Stools / Counter Stools Fund','furniture_fixtures','fund',false,ARRAY['FC','BO','RC','KI'],NULL,NULL,NULL,250,1200,5000,'Counter seating. Quantity depends on counter length.',NULL,1002),
('Condiment Station / Cream and Sugar Bar','furniture_fixtures','equipment',false,ARRAY['FC','BO','RC'],80,300,900,NULL,NULL,NULL,'Holds cream, sugar, stir sticks, napkins, lids for self-serve.',NULL,1003),
('Pastry / Retail Display Case','furniture_fixtures','equipment',false,ARRAY['FC','RC'],200,1200,5000,NULL,NULL,NULL,'Tiered cake stand, glass display case, or refrigerated display case.',NULL,1004),
('Outdoor Furniture Fund (Patio)','furniture_fixtures','fund',false,ARRAY['FC','RC'],NULL,NULL,NULL,300,2000,8000,'Optional. Weather-rated tables/chairs for outdoor seating.',NULL,1005),
('Opening Decor and Branding Fund','signage_decor','fund',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],NULL,NULL,NULL,500,3500,15000,'Wall art, plants, branded prints, window clings, merchandise holders. Exterior illuminated signage excluded.',NULL,1100),
('Digital Menu Board Screens','signage_decor','equipment',true,ARRAY['FC','DT','RC','DW'],200,600,2500,NULL,NULL,NULL,'Commercial display screens with mount. Software subscription excluded. Typical 2-4 screens.',NULL,1101),
('Chalkboard Menu Boards (Set)','signage_decor','equipment',true,ARRAY['FC','KI','BO','MO','RC'],50,200,600,NULL,NULL,NULL,'Frame-style chalkboards or chalkboard paint panels. Budget: 2-4 boards.',NULL,1102),
('Business Laptop or Computer','tech_back_office','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],400,900,2000,NULL,NULL,NULL,'Admin, accounting, scheduling. Software excluded.',NULL,1200),
('WiFi Router / Wireless Access Point','tech_back_office','equipment',true,ARRAY['FC','KI','DT','BO','RC','DW'],80,250,600,NULL,NULL,NULL,'Hardware only; internet service excluded.',NULL,1201),
('Security Camera System (NVR Kit)','tech_back_office','equipment',false,ARRAY['FC','KI','DT','BO','RC','DW'],120,600,2500,NULL,NULL,NULL,'4-8 camera kit with NVR; covers interior + exterior.',NULL,1202),
('Music / Sound System','tech_back_office','equipment',false,ARRAY['FC','BO','RC','DW'],150,600,2500,NULL,NULL,NULL,'Hardware: speakers, amplifier, source. Service subscription excluded.',NULL,1203),
('Label Maker (Back-of-House)','tech_back_office','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],30,80,200,NULL,NULL,NULL,'Date/content labels for storage.',NULL,1204),
('Fire Extinguisher (ABC Rated)','tech_back_office','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],40,80,200,NULL,NULL,NULL,'Required by fire code; typically 2.5-10 lb ABC type.',NULL,1205),
('First Aid Kit (ANSI Class B)','tech_back_office','equipment',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],35,75,200,NULL,NULL,NULL,'OSHA/health code requirement. Refill annually.',NULL,1206),
('Safe / Cash Management Safe','tech_back_office','equipment',false,ARRAY['FC','KI','DT','DW','RC'],80,250,700,NULL,NULL,NULL,'Burglary-resistant for end-of-day deposits.',NULL,1207),
('Miscellaneous Startup Fund','miscellaneous','fund',true,ARRAY['FC','KI','DT','BO','MO','RC','DW'],NULL,NULL,NULL,500,2500,6000,'Extension cords, shelving, tool kit, hooks, missing smallwares discovered on opening day, extra cleaning supplies, office supplies.',NULL,1300),
('Coffee Cart / Mobile Espresso Cart','mobile_specific','equipment',true,ARRAY['MO'],3000,9000,25000,NULL,NULL,NULL,'The cart itself is capital equipment. Used ($3k), new custom build ($9-15k), turnkey ($25k).',NULL,1400),
('Generator or Battery Power Station','mobile_specific','equipment',true,ARRAY['MO'],500,2000,8000,NULL,NULL,NULL,'For off-grid events. Honda EU2200i ($1,100), EcoFlow DELTA Pro ($2,200).',NULL,1401),
('Propane Burner / Induction Plate','mobile_specific','equipment',false,ARRAY['MO'],50,150,400,NULL,NULL,NULL,'For pour-over heating when no shore power.',NULL,1402),
('Insulated Water Container (Large Format)','mobile_specific','equipment',true,ARRAY['MO'],60,200,500,NULL,NULL,NULL,'5-10 gallon fresh water source for mobile locations without direct plumbing.',NULL,1403),
('Drive-Thru Window Heat Lamp / Warmer','drive_thru_specific','equipment',true,ARRAY['DT','DW'],80,250,600,NULL,NULL,NULL,'Keeps drinks warm while waiting for car.',NULL,1500),
('Drive-Thru Menu Board (Outdoor Illuminated)','drive_thru_specific','equipment',true,ARRAY['DT','DW'],500,2500,8000,NULL,NULL,NULL,'Physical weatherproof hardware unit; not the light-up sign above window (that is build-out).',NULL,1501),
('Sample Roaster / Cupping Equipment Set','roastery_specific','equipment',true,ARRAY['RC'],800,3000,10000,NULL,NULL,NULL,'Quality control cuppings. Ikawa Pro, Aillio Bullet R1. Includes cupping spoons, bowls, rinse cups.',NULL,1600),
('Retail Bag Sealer (Impulse)','roastery_specific','equipment',true,ARRAY['RC'],40,120,400,NULL,NULL,NULL,'Seals retail coffee bags. Uline impulse sealer.',NULL,1601),
('Retail Coffee Bean Storage Bins (Display)','roastery_specific','equipment',false,ARRAY['RC'],50,500,2000,NULL,NULL,NULL,'Display hoppers or sealed bins for retail sale.',NULL,1602);
