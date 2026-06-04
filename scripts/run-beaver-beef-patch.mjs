#!/usr/bin/env node
/**
 * Equivalent of supabase/seeds/demo-beaver-beef-patch.sql executed via REST API.
 * Addresses TIM-1597: fill missing Equipment, Launch, and Marketing sections
 * for the trent@simpler.coffee "Beaver & Beef" demo account.
 *
 * Uses service_role key to bypass RLS (same privilege as running SQL via psql).
 * Safe to re-run: DELETE+INSERT with fixed UUIDs; workspace_document uses upsert.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL env var required");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY env var required — never hard-code prod keys in source");

const DEMO_EMAIL = "trent@simpler.coffee";
const OPENING_DATE = "2026-09-15";

const headers = {
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey": SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
  "Prefer": "return=representation",
};

async function req(method, path, body, extraHeaders = {}) {
  const resp = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!resp.ok) {
    throw new Error(`${method} ${path} → ${resp.status}: ${text.slice(0,500)}`);
  }
  return data;
}

async function main() {
  // ── 1. Resolve user ──────────────────────────────────────────────────────────
  console.log(`Looking up user: ${DEMO_EMAIL}`);
  const usersResp = await req("GET", `/auth/v1/admin/users?email=${encodeURIComponent(DEMO_EMAIL)}&per_page=1`);
  const user = usersResp?.users?.[0];
  if (!user) throw new Error(`User ${DEMO_EMAIL} not found — is this the right environment?`);
  const userId = user.id;
  console.log(`  user_id: ${userId}`);

  // ── 2. Resolve plan ──────────────────────────────────────────────────────────
  console.log("Looking up Beaver & Beef plan...");
  let planResp = await req("GET", `/rest/v1/coffee_shop_plans?user_id=eq.${userId}&plan_name=ilike.*beaver*&order=created_at.desc&limit=1`);
  let plan = planResp?.[0];
  if (!plan) {
    planResp = await req("GET", `/rest/v1/coffee_shop_plans?user_id=eq.${userId}&order=created_at.desc&limit=1`);
    plan = planResp?.[0];
  }
  if (!plan) throw new Error(`No plan found for ${DEMO_EMAIL}`);
  const planId = plan.id;
  console.log(`  plan_id: ${planId}  (${plan.plan_name})`);

  // ── 3. Equipment items ───────────────────────────────────────────────────────
  console.log("Patching equipment items...");

  const equipmentIds = [
    "bb000001-0000-0000-0000-000000000001",
    "bb000001-0000-0000-0000-000000000002",
    "bb000001-0000-0000-0000-000000000003",
    "bb000001-0000-0000-0000-000000000004",
    "bb000001-0000-0000-0000-000000000005",
    "bb000001-0000-0000-0000-000000000006",
    "bb000001-0000-0000-0000-000000000007",
    "bb000001-0000-0000-0000-000000000008",
    "bb000001-0000-0000-0000-000000000009",
    "bb000001-0000-0000-0000-000000000010",
    "bb000001-0000-0000-0000-000000000011",
    "bb000001-0000-0000-0000-000000000012",
  ];

  // Delete existing
  await req("DELETE", `/rest/v1/buildout_equipment_items?id=in.(${equipmentIds.join(",")})`);
  console.log("  Deleted old equipment items");

  const equipmentItems = [
    { id: equipmentIds[0], plan_id: planId, position: 0, name: "La Marzocco Linea Micra (2-Group)", category: "espresso_station", vendor: "La Marzocco", model: "Linea Micra", quantity: 1, unit_cost_cents: 1850000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Primary espresso machine. Compact footprint for 900 sqft; 2-group handles morning rush. CAD price includes duty and local dealer setup fee." },
    { id: equipmentIds[1], plan_id: planId, position: 1, name: "Mahlkonig E65S GbW Grinder", category: "espresso_station", vendor: "Mahlkonig", model: "E65S GbW", quantity: 2, unit_cost_cents: 280000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Two grinders: one dedicated espresso blend (Phil & Sebastian), one for decaf/single-origin. Gravimetric model reduces dose variance across a busy morning shift." },
    { id: equipmentIds[2], plan_id: planId, position: 2, name: "Marco UBER Boiler Batch Brewer", category: "brew_platform", vendor: "Marco Beverage Systems", model: "UBER Boiler", quantity: 1, unit_cost_cents: 420000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Batch brewer for filter coffee and tea. Programmable brew ratios; recommended by Phil & Sebastian for single-origin filter rotation." },
    { id: equipmentIds[3], plan_id: planId, position: 3, name: "True Refrigeration 48\" Undercounter Refrigerator", category: "refrigeration", vendor: "True Refrigeration", model: "TUC-48-HC", quantity: 1, unit_cost_cents: 295000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Bar-height undercounter fridge for milk and dairy alternatives behind the espresso bar." },
    { id: equipmentIds[4], plan_id: planId, position: 4, name: "Atosa 48\" Refrigerated Sandwich Prep Table", category: "refrigeration", vendor: "Atosa", model: "MSF8306GR", quantity: 1, unit_cost_cents: 240000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Refrigerated prep table for beef sandwich assembly. Holds Whitehorse Farms beef and Sidewalk Citizen bread at safe temperature through a full lunch service." },
    { id: equipmentIds[5], plan_id: planId, position: 5, name: "Atosa Commercial Reach-In Freezer", category: "refrigeration", vendor: "Atosa", model: "MBF8003GR", quantity: 1, unit_cost_cents: 185000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Back-of-house freezer for bulk beef storage. Rocky Mountain Meats delivers 2x/week; this holds the weekly buffer stock." },
    { id: equipmentIds[6], plan_id: planId, position: 6, name: "Square for Restaurants -- Hardware Bundle", category: "pos_tech", vendor: "Square", model: "Restaurant Starter Kit", quantity: 2, unit_cost_cents: 85000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Two terminals: one counter POS, one KDS display for sandwich build workflow. Monthly SaaS subscription included in Opex." },
    { id: equipmentIds[7], plan_id: planId, position: 7, name: "Commercial Panini / Sandwich Press", category: "food_prep", vendor: "Waring", model: "WPG250B", quantity: 2, unit_cost_cents: 55000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Two presses for back-to-back sandwich volume at peak. Warm beef and toasted Sidewalk Citizen bread is the signature item." },
    { id: equipmentIds[8], plan_id: planId, position: 8, name: "Panasonic Commercial Microwave", category: "food_prep", vendor: "Panasonic", model: "NE-1025F", quantity: 1, unit_cost_cents: 38000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Rapid warming for beef portions. Complements the press without requiring a full hood or ventilation upgrade." },
    { id: equipmentIds[9], plan_id: planId, position: 9, name: "Rhino Coffee Gear Pro Bar Kit", category: "smallwares", vendor: "Rhino Coffee Gear", model: "Pro Bar Kit", quantity: 1, unit_cost_cents: 65000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Knock box, tamper mat, shot glasses, WDT tool, milk pitchers (4), thermometers, and bar cleaning brushes." },
    { id: equipmentIds[10], plan_id: planId, position: 10, name: "Counter Height Bar Stools (Set Of 8)", category: "furniture_fixtures", vendor: "Inglewood Habitat Restore", model: null, quantity: 8, unit_cost_cents: 18000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Reclaimed-wood bar stools consistent with Beaver & Beef industrial-Canadian identity. 8 seats at window bar." },
    { id: equipmentIds[11], plan_id: planId, position: 11, name: "Cafe Tables And Chairs -- 4-Top Sets", category: "furniture_fixtures", vendor: "IKEA Calgary", model: "GAMLEBY", quantity: 4, unit_cost_cents: 22000, priority_tier: "must_have", financing_method: "cash", source: "user_added", notes: "Four 4-top sets for main floor (16 seats). Paired with bar stools = 22 total seats matching the lease plan." },
  ];

  await req("POST", "/rest/v1/buildout_equipment_items", equipmentItems);
  console.log(`  Inserted ${equipmentItems.length} equipment items`);

  // ── 4. Launch milestones ─────────────────────────────────────────────────────
  console.log("Patching launch milestones...");

  const milestoneIds = [
    "bb000002-0000-0000-0000-000000000001",
    "bb000002-0000-0000-0000-000000000002",
    "bb000002-0000-0000-0000-000000000003",
    "bb000002-0000-0000-0000-000000000004",
    "bb000002-0000-0000-0000-000000000005",
    "bb000002-0000-0000-0000-000000000006",
    "bb000002-0000-0000-0000-000000000007",
    "bb000002-0000-0000-0000-000000000008",
    "bb000002-0000-0000-0000-000000000009",
  ];

  await req("DELETE", `/rest/v1/launch_milestones?id=in.(${milestoneIds.join(",")})`);
  console.log("  Deleted old launch milestones");

  const openingDate = OPENING_DATE;
  function daysBeforeOpening(days) {
    const d = new Date(openingDate);
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  }

  const milestones = [
    { id: milestoneIds[0], plan_id: planId, title: "Register business entity (AB numbered company) + obtain BN from CRA", description: "Jordan MacLeod incorporated May 18, 2026. Business Number issued. GST account registered. Required before lease signing or payroll.", track: "legal_compliance", target_date: daysBeforeOpening(120), status: "done", owner: "Jordan MacLeod", source: "user_added", order_index: 0, critical_path: true },
    { id: milestoneIds[1], plan_id: planId, title: "Sign 5-year lease at 1207 9 Ave SE, Inglewood", description: "Lease signed June 17, 2026. $4,200/month base NNN + $680 CAM. 5-year term with renewal option. Keys received same day.", track: "real_estate_buildout", target_date: daysBeforeOpening(90), status: "done", owner: "Jordan MacLeod", source: "user_added", order_index: 1, critical_path: true },
    { id: milestoneIds[2], plan_id: planId, title: "Submit development permit + health permit applications to City of Calgary", description: "Applications submitted to City of Calgary Planning + Development and AHS. Typical review window: 6-8 weeks.", track: "legal_compliance", target_date: daysBeforeOpening(88), status: "done", owner: "Jordan MacLeod / GC", source: "user_added", order_index: 2, critical_path: true },
    { id: milestoneIds[3], plan_id: planId, title: "Place equipment orders: La Marzocco Linea Micra, Mahlkonig grinders, refrigeration", description: "La Marzocco ordered via The Espresso Company (Calgary dealer). Mahlkonig E65S GbW x2 ordered. Atosa fridges on order through Nella Distributing. Lead times: espresso machine 6-8 weeks, grinders 2-3 weeks.", track: "equipment", target_date: daysBeforeOpening(60), status: "in_progress", owner: "Jordan MacLeod", source: "user_added", order_index: 3, critical_path: true },
    { id: milestoneIds[4], plan_id: planId, title: "Complete buildout: bar millwork, electrical rough-in, plumbing for espresso", description: "GC: Cornerstone Construction (Inglewood). Bar millwork in progress. 200A electrical panel upgrade complete. 3/4\" water line stubbed to espresso machine position.", track: "real_estate_buildout", target_date: daysBeforeOpening(45), status: "in_progress", owner: "Cornerstone Construction", source: "user_added", order_index: 4, critical_path: true },
    { id: milestoneIds[5], plan_id: planId, title: "Complete first-round hiring: lead barista + sandwich prep lead", description: "Job posts on Indeed and local Calgary coffee community boards. Targeting 1 barista trainer + 1 BOH prep lead. Pre-open training window is 4 weeks -- hire by Aug 16 to make the schedule.", track: "people_hiring", target_date: daysBeforeOpening(30), status: "not_started", owner: "Jordan MacLeod", source: "user_added", order_index: 5, critical_path: false },
    { id: milestoneIds[6], plan_id: planId, title: "Permits approved; equipment installed and commissioned; health inspection passed", description: "AHS inspector walk-through scheduled for Sept 1. Espresso machine calibration with Phil & Sebastian tech rep same day. 2-week buffer for punch-list items before soft open.", track: "legal_compliance", target_date: daysBeforeOpening(14), status: "not_started", owner: "Jordan MacLeod / GC", source: "user_added", order_index: 6, critical_path: true },
    { id: milestoneIds[7], plan_id: planId, title: "Soft open -- friends, family, and Inglewood neighbourhood preview", description: "Invite-only day for 50 guests. Test full menu: espresso bar + beef sandwiches. POS live. Feedback on service flow and sandwich build times. Target: zero order errors.", track: "pre_launch_events", target_date: daysBeforeOpening(7), status: "not_started", owner: "Full team", source: "user_added", order_index: 7, critical_path: false },
    { id: milestoneIds[8], plan_id: planId, title: "Grand opening -- first day of public service at Beaver & Beef", description: "Jordan and full team. Instagram announcement live Sept 12. Local press outreach to Avenue Calgary and Curiocity sent Sept 10. Staff ratio 3:1 for opening week to absorb volume.", track: "pre_launch_events", target_date: openingDate, status: "not_started", owner: "Full team", source: "user_added", order_index: 8, critical_path: true },
  ];

  await req("POST", "/rest/v1/launch_milestones", milestones);
  console.log(`  Inserted ${milestones.length} launch milestones`);

  // ── 5. Marketing document ────────────────────────────────────────────────────
  console.log("Upserting marketing workspace document...");

  const marketingContent = {
    overview: {
      narrative: "Beaver & Beef is a word-of-mouth-first brand. Inglewood is a tight-knit, food-proud neighbourhood -- we earn every customer through what is in the cup and on the plate, not ad spend. The strategy is built on three pillars: a strong Google Business Profile to capture local search, a consistent Instagram presence that shows the craft and the cheeky Canadian identity, and deep community roots through partnerships with Inglewood businesses and events. Pre-launch, we focus on building an email list of 250+ subscribers before opening day so we have a direct channel that does not depend on a social algorithm."
    },
    channels: {
      selected: [
        { name: "Instagram", notes: "Primary channel. 3 posts per week: espresso process, beef sandwich builds, neighbourhood stories. Stories daily for behind-the-scenes and specials. Target 1,000 followers by opening day." },
        { name: "Google Business Profile", notes: "Claimed and fully built out. 500+ photos of space, menu, and team. Respond to every review within 24 hours. Critical for local search and map placement." },
        { name: "Email Newsletter", notes: "Monthly email to subscriber list. Opening day countdown, menu previews, and seasonal specials. Mailchimp free tier to start; upgrade when list exceeds 500." },
        { name: "Local Press", notes: "Outreach to Avenue Calgary, Curiocity, and the Inglewood Sunridge BIA newsletter. Target coverage tied to grand opening." },
        { name: "Community Events", notes: "Inglewood Sunridge BIA events: Night Market, Sunday Promenade. Presence at 2 events before opening to build recognition before the doors open." },
        { name: "Word Of Mouth", notes: "The long game. Quality drives it. Every soft-open guest is a potential brand ambassador. Give them a reason to tell their friends before opening week." }
      ]
    },
    story: {
      founder_story: "Jordan MacLeod grew up watching their parents run a deli in Red Deer. After a decade in oil-and-gas project management, Jordan spent a year in Phil & Sebastian's barista training programme and realized the two passions -- great coffee and great Canadian meat -- did not have to live in separate buildings. Beaver & Beef is the shop Jordan wanted to walk into every morning and could never find.",
      origin: "The name came from a conversation at a Calgary Stampede breakfast. A friend joked that the most honest Canadian branding would just say what it is. Beaver for the national symbol and the earnest hard-working spirit. Beef because Calgary. Beef because Rocky Mountain Meats raises it 90 minutes from the shop. The cheeky name earns a second look; the product earns the return visit.",
      differentiator: "No other specialty coffee shop in Inglewood serves a full beef sandwich menu built on locally sourced Canadian beef. Phil & Sebastian coffee anchors the morning crowd. The sandwich menu anchors the lunch crowd. Together they justify the 7am-5pm window and a $14.80 average ticket -- well above a coffee-only shop in the same market.",
      target_customer: "Working professionals and tradespeople in Inglewood, Ramsay, and Scotiabank Saddledome-adjacent offices. Ages 28-50. They want craft coffee without pretension and a real lunch that is not a sad desk salad. They are proud of buying local and will tell their colleagues where they eat. Secondary: weekend foot traffic from the Inglewood antique district and 9 Ave SE restaurant row."
    },
    pre_launch: {
      milestones: [
        { id: "bb_mktg_01", label: "Claim Google Business Profile and upload 50 photos", target_date: "2026-08-01", notes: "Photos: exterior, bar build, espresso machine, Phil & Sebastian beans, beef prep. Done before any Instagram posts so search is indexed before the account goes public.", completed: true },
        { id: "bb_mktg_02", label: "Launch Instagram account and post first 9 grid photos", target_date: "2026-08-15", notes: "Brand photography session with Calgary photographer. 9-photo grid establishes the visual identity. Aim for 200 followers before soft open.", completed: false },
        { id: "bb_mktg_03", label: "Email list to 250 subscribers pre-opening", target_date: "2026-09-12", notes: "Collect via Instagram link-in-bio, Inglewood BIA events, and QR card at Phil & Sebastian locations. 250 is the threshold for the opening-day announcement email.", completed: false },
        { id: "bb_mktg_04", label: "Send press kit to Avenue Calgary and Curiocity", target_date: "2026-09-10", notes: "Include: concept summary, founding story, high-res photos, opening date, and a quote from Jordan. Target: one editorial feature before or within the first week.", completed: false },
        { id: "bb_mktg_05", label: "Soft-open guest list invitations sent", target_date: "2026-09-06", notes: "Direct Instagram DM and email invite to 50 guests: friends, family, Inglewood neighbours, Phil & Sebastian staff. RSVP via Google Form.", completed: false },
        { id: "bb_mktg_06", label: "Grand opening Instagram announcement post live", target_date: "2026-09-12", notes: "One strong post with opening date, hours, address, and a 15-second Reel showing the espresso pull and sandwich build. Boosted post: $50 CAD geo-targeted to Inglewood/Ramsay/Mission postal codes.", completed: false }
      ]
    },
    last_generated_at: null
  };

  // Upsert: try PATCH first (row likely exists), fall back to POST
  try {
    await req("PATCH", `/rest/v1/workspace_documents?plan_id=eq.${planId}&workspace_key=eq.marketing`, {
      content: marketingContent,
    });
    console.log("  Updated existing marketing workspace document");
  } catch {
    await req("POST", "/rest/v1/workspace_documents", {
      plan_id: planId,
      workspace_key: "marketing",
      content: marketingContent,
    });
    console.log("  Inserted new marketing workspace document");
  }

  console.log("  Upserted marketing workspace document");

  console.log(`\nPatch complete for plan ${planId}:`);
  console.log(`  - 12 equipment items`);
  console.log(`  - 9 launch milestones`);
  console.log(`  - 1 marketing document`);
}

main().catch((err) => {
  console.error("\nERROR:", err.message);
  process.exit(1);
});
