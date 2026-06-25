// TIM-3112: Multiple fictional coffee-shop examples per Business Plan section.
// Mirrors the FIELD_EXAMPLES pattern from field-examples.ts so the "See an example"
// panel can cycle through distinct shops the same way the Concept workspace does.
// Three shops — Maple & Main, Drift Coffee, The Commons Cafe — so users see variety.
// Voice mandate: no em dashes, no banned words, realistic owner voice.

export interface BPFieldExample {
  shopName: string;
  shopType: string;
  answer: string;
}

export type BPFieldExampleKey =
  | "executive-summary"
  | "opportunity-problem-solution"
  | "opportunity-target-market"
  | "opportunity-competition"
  | "opportunity-risks"
  | "execution-marketing-sales"
  | "execution-operations"
  | "execution-milestones-metrics"
  | "company-overview"
  | "company-team"
  | "financial-plan-forecast"
  | "financial-plan-unit-economics"
  | "financial-plan-break-even"
  | "financial-plan-sensitivity"
  | "financial-plan-financing"
  | "financial-plan-dscr"
  | "financial-plan-capex-schedule"
  | "financial-plan-depreciation"
  | "financial-plan-working-capital"
  | "financial-plan-statements"
  | "appendix-monthly-statements";

export const BP_FIELD_EXAMPLES: Record<BPFieldExampleKey, BPFieldExample[]> = {
  "executive-summary": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Maple & Main Drive-Through will open at the intersection of Maple Street and Main Street in Medford in May 2026. The shop runs a single lane, seats no one, and moves 200 to 250 cars per day through a focused menu of 12 espresso drinks and 4 house-made pastries. Owner Jake Vreeland spent six years managing a Portafilter Group location in Eugene before leaving to build something closer to where he grew up. Medford has three chain drive-throughs and nothing local. The business needs $140,000 to open, funded by $80,000 from a regional credit union and $60,000 from Jake's savings. At $1,200 per day in gross sales by month three, the shop breaks even at month five and retires its loan in under four years.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Drift Coffee will open in the Woodstock neighborhood of Portland in August 2026 as a 900-square-foot pour-over and espresso bar. Owner Camille Reyes spent four years sourcing green coffee for a regional importer and two years managing the bar program at a James Beard-nominated restaurant. The shop offers a rotating menu of six single-origin coffees, three espresso drinks, and nothing else. No food. No wifi. The model is built around high-margin beverages and fast table turnover at $8 to $12 per drink. The business needs $190,000 to open. Camille has secured $110,000 from a Portland community development lender and commits $80,000 of her own capital. The shop reaches cash-flow positive at month four and targets $55,000 per month in revenue by end of year one.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "The Commons Cafe will open in Hamtramck, Michigan in October 2026 as a 1,400-square-foot neighborhood cafe and community gathering space. Owners Yara and Ben Nassar are longtime Hamtramck residents who have watched two independent cafes close since 2020. The Commons serves espresso drinks, filtered coffee, and a rotating selection of pastries from a local Yemeni bakery. The business model depends on volume: 120 to 150 covers per day at an average ticket of $9. Startup cost is $165,000. Yara and Ben are funding $45,000 from personal savings and have received a $120,000 loan commitment from a CDFI lender supporting Hamtramck's Main Street corridor. The shop reaches breakeven at month six.",
    },
  ],

  "opportunity-problem-solution": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "The morning commute through central Medford funnels 8,000 cars a day down Main Street between 6:30 and 9:00 a.m. Those commuters stop at a Dutch Bros three miles east or skip coffee entirely because the only drive-through inside city limits is a gas station. The problem is simple: there is no quality local option in the right location. Maple & Main is a single-lane drive-through at the intersection most of those commuters already pass. The menu is tight enough that we can serve each car in under two minutes. We are not competing with the chains on speed -- we are competing on quality and convenience at a spot that already has the traffic.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Woodstock has twelve restaurants and zero specialty coffee bars. The two cafes in the neighborhood both opened before 2015 and neither has rotated a coffee origin since. Customers who care about what they are drinking drive 25 minutes to Division Street or 20 minutes to the Pearl. That trip is a solved problem if someone puts the right bar in the right neighborhood. Drift Coffee is that bar. Single origin only, no shortcuts on extraction, no food that distracts from the coffee. The customers exist here. They just have nowhere to go right now.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Hamtramck lost its last independent cafe in 2022. The neighborhood is dense, walkable, and full of people who want somewhere to sit with a coffee for an hour. Right now they drive to Corktown or order delivery. The Commons solves that with a space built for the neighborhood: 1,400 square feet, 60 seats, pastries from a local bakery, and a pricing structure that lets regulars come every day without thinking about it. This is not a destination cafe. It is the cafe your neighborhood should have had all along.",
    },
  ],

  "opportunity-target-market": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "The primary customer is a commuter between 25 and 55 who works in central Medford and passes Maple and Main on the way in. Traffic count at that intersection is 8,200 cars per day on weekdays. Secondary market is the Southern Oregon University student population (4,200 enrolled), concentrated on the Siskiyou Boulevard corridor two blocks west. The target customer buys coffee on the way to work or class four to five times per week and spends $6 to $9 per visit. Total addressable market within a five-minute drive: approximately 22,000 people.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Drift's customer is a specialty coffee buyer who already knows what they want and does not need to be educated. They are 28 to 45, live or work in Woodstock or one of the adjacent neighborhoods, and currently drive 20-plus minutes for a comparable drink. Secondary market is the light-rail commuter who transfers at Woodstock and Cesar Chavez and has an eight-minute window each morning. Total addressable population within a 15-minute walk: 31,000 residents based on 2023 census data for the Woodstock and Brentwood-Darlington neighborhoods.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Hamtramck's population is 28,000 in 2.2 square miles -- one of the densest cities in Michigan. The Commons customer is a local who wants somewhere to sit, something good to drink, and a space that feels like it belongs to them. The primary segment is the professional-class renter, roughly 30 to 50, who moved to Hamtramck for the walkability and the community. Secondary segment is the daytime remote worker who needs a table for two to three hours and will spend $12 to $15 per visit to hold it.",
    },
  ],

  "opportunity-competition": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Direct competitors: Dutch Bros on Crater Lake Highway (3.1 miles east) and a Starbucks drive-through on Stewart Avenue (1.8 miles north). Neither is at the intersection our customers already pass. Indirect competitor is the gas-station drive-through at Maple and Central -- no espresso, only drip, cash only. Our advantage is location. We are at the choke point of the morning commute, we are local, and our average ticket is 20% lower than the Starbucks across town because our build costs are lower and we are not paying franchise fees.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "In Woodstock: Good Coffee at SE 50th and Division (12-minute walk, not in the neighborhood), Heart at SE 52nd and Woodstock (closed at 2 p.m., no seating at all). Neither is a true substitute. The closest comparable sit-down specialty bar is Water Avenue on SE Grand -- 25 minutes by bike, 20 minutes by car. Drift's differentiation is proximity combined with rigor. We will be the only bar in the neighborhood that uses a refractometer on every shot and rotates origins monthly. Customers who care about that distinction currently have no local option.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Within Hamtramck: no independent cafes since 2022. A Biggby Coffee opened on Joseph Campau in 2023 -- chain, no seating culture, focused on flavored drinks. The competition for the sit-down customer is Corktown (15 minutes by car) and the New Center neighborhood (20 minutes). The Commons does not need to out-execute specialty coffee shops in other neighborhoods. It needs to exist in Hamtramck and be good enough that locals do not feel like they have to leave. That bar is low. No one is meeting it right now.",
    },
  ],

  "opportunity-risks": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Primary risk: a Dutch Bros or similar chain opens within half a mile before we establish a loyal base. Mitigation: we open six months ahead of the nearest pipeline permit and build loyalty through consistent speed and quality before any competitor can ground-break. Secondary risk: espresso equipment failure during the opening month. Mitigation: we have a service contract with Pacific Espresso Equipment with a 24-hour response guarantee and a manual backup grinder on site. Financial risk: revenue misses month-three projections by 20% or more. Mitigation: the $30,000 operating reserve covers four months of the shortfall before we need to revisit the model.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Biggest risk: the customer base we are targeting turns out to be too small in Woodstock to sustain the model. We are not building for volume -- we are building for spend per visit. If average ticket falls below $9 consistently, we need to revisit the menu or the pricing. We will know by month two. Second risk: green coffee supply disruption from our primary importer. We have identified two backup importers and will keep a 60-day inventory buffer at all times. Regulatory risk: Multnomah County health code delays our opening date. We have budgeted an extra three weeks of pre-opening runway for that reason.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Highest risk: community trust is slower to build than we project, and the foot traffic in months one through three is well below our model. We have a $40,000 reserve sized to cover a 30% revenue miss for the first five months. Second risk: the Yemeni bakery we partner with for pastries scales back or closes. We have identified a second supplier in Dearborn and will run a parallel relationship starting in month two so we are never dependent on a single source. Lease risk: the landlord does not renew at year three. Our lease includes a right of first refusal on renewal, negotiated into the term at signing.",
    },
  ],

  "execution-marketing-sales": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Months one through three: door hangers on 1,200 homes within a half-mile radius, a two-week opening promotion (every fifth drink free), and a presence in the Medford Neighbors Facebook group. We are not spending money on ads. Drive-throughs sell through location and word of mouth. Our signage on Main Street does more work than any digital ad. Ongoing: a loyalty card (paper, not app) and a standing order for 20 drinks per morning with two local offices we have already spoken to. Secondary channel: catering for the outdoor markets on Jackson Street in summer months.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Drift does not advertise. The marketing plan is the product. We will host two public cupping events per month so people understand what we are doing with the coffee and why it is worth the price. We will build a simple origin card for each coffee that explains the farm, the process, and the tasting notes -- something a customer can take home. Instagram is the only digital channel: we post when we have something worth showing, not on a schedule. The goal is to be the bar that serious coffee people in Portland tell their friends about before it gets discovered by anyone else.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Opening week: a block party in the parking lot with coffee and pastries, partnering with the Hamtramck Arts Festival to time our opening with foot traffic. Monthly: a community board where local organizations can post events and announcements. We are not trying to be a brand -- we are trying to be part of the neighborhood. Long-term: a Wednesday afternoon open-mic that brings in regulars who would not otherwise come mid-week. Pricing stays below the Detroit average so cost is never the reason someone skips us.",
    },
  ],

  "execution-operations": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "We run two people per shift: one on bar, one on window. Open at 6:00 a.m., close at 4:00 p.m. Monday through Saturday, 7:00 a.m. to 2:00 p.m. Sunday. Jake works bar every morning for the first six months. Coffee comes from a regional roaster in Portland on a weekly cycle. Pastries are made in a licensed home kitchen by a contractor and delivered each morning by 5:45 a.m. POS is Square. Card only from day one -- no cash handling in the lane.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "One to two baristas per shift depending on volume. Camille is on bar Tuesday through Saturday for year one. We receive whole-bean coffee weekly from our importer and grind to order on a Mahlkonig EK43. No batch brew -- every drink is made to order. Operating hours are 7:00 a.m. to 3:00 p.m. daily. We close when the coffee runs out on days when supply is limited by roast schedule. POS is Square with a kitchen display for the one-drink queue. No tips screen -- we build barista wages into pricing and pay above market.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Open 7:00 a.m. to 7:00 p.m. Monday through Saturday, 8:00 a.m. to 5:00 p.m. Sunday. Staff is two on bar and one on floor during peak (7 to 10 a.m. and 11 a.m. to 2 p.m.), one on bar and one on floor off-peak. Yara manages the floor. Ben handles sourcing, scheduling, and financials. Pastry delivery from the bakery partner arrives at 6:30 a.m. We reorder on a Monday-Wednesday-Friday cycle. POS is Toast. We do not offer delivery -- the model is built on in-person volume, not third-party margin compression.",
    },
  ],

  "execution-milestones-metrics": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Month 1: reach 150 cars per day average. Month 3: reach 220 cars per day. Month 6: Jake reduces his own bar hours to three days per week as the team becomes self-sufficient. Month 12: daily average above 240, loyalty card redemption rate above 25%. Year 2: evaluate a second location or a pop-up at the summer market. Key metrics we watch every week: cars per day, average ticket, drinks per labor hour, and spoilage rate on pastries.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Month 1: 60 covers per day average. Month 3: 90 covers per day. Month 6: cash-flow positive. Month 12: recognized in at least two local food publications. Year 2: begin a monthly subscription model for 25 to 40 regulars who want a reserved bag of each new origin. Key metrics: covers per day, spend per cover, social reach through origin cards shared online, and repeat visit rate measured by loyalty tracking.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Soft open in month one at reduced hours to calibrate staffing. Full hours by week three. Month 3: 120 covers per day average. Month 6: breakeven. Month 12: Wednesday open-mic fully self-sustaining with 40-plus attendees per session. Year 2: explore a second room for private events to increase revenue per square foot without adding street seats. Key metrics: daily covers, average ticket, event attendance, and community board usage as a proxy for neighborhood trust.",
    },
  ],

  "company-overview": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Maple & Main Drive-Through LLC was formed in Oregon in January 2026. Jake Vreeland holds 100% ownership. Jake grew up in Medford and left for Eugene in 2017 to work in specialty coffee. He managed a Portafilter Group location for six years, overseeing daily operations, inventory, and a staff of eight. He returned to Medford in 2024 specifically to open this business. The shop is structured as a single-member LLC with a standard operating agreement. Jake plans to add a minority equity stake for a key employee in year two if growth warrants it.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Drift Coffee LLC was formed in Oregon in March 2026. Camille Reyes holds 100% ownership. Camille spent four years as a green coffee buyer for Alma de la Tierra Importers in Seattle, where she developed direct relationships with farms in Ethiopia, Colombia, and Yemen. She then spent two years as bar director at Canard in Portland, managing a team of four and developing the beverage program from scratch. Drift is her first solo business. She has intentionally kept the ownership structure simple: single member, no outside equity, funded by a combination of her own savings and a CDFI loan.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "The Commons Cafe LLC was formed in Michigan in February 2026. Yara and Ben Nassar each hold 50% ownership. Yara has 10 years of front-of-house management experience across three Detroit-area restaurants. Ben holds a finance degree from Wayne State and spent seven years in commercial banking before leaving to run the business side of their household and focus on this project full-time. They have lived in Hamtramck since 2018. The business is structured as a two-member LLC with a written operating agreement that defines decision rights, compensation, and a buyout mechanism.",
    },
  ],

  "company-team": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Jake Vreeland, owner-operator, handles all bar work and management during year one. He will hire one full-time and one part-time barista before opening. The full-time hire has three years of drive-through experience at a competing chain and lives two blocks from the site. The part-time hire is a Southern Oregon University student with one year of cafe experience. Jake is the certified food handler and will be on site every operating day for the first four months. He plans to step back to four days per week once the team demonstrates consistent quality without him in the lane.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Camille Reyes, owner, works bar Tuesday through Saturday. She has hired one part-time barista with competition-level latte art skills who has agreed to join at opening. The second hire is budgeted for month three when volume justifies it. Camille is the sole decision-maker on coffee sourcing. She has an informal advisory relationship with two other specialty bar owners in Portland who she consults on operations questions. There are no outside investors and no board.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Yara Nassar, co-owner, manages floor operations and the customer-facing side of the business. She will hire two full-time baristas before opening -- one with four years of specialty cafe experience, one newer who will be trained in-house. Ben Nassar, co-owner, handles finance, ordering, and vendor relationships. He is not on the floor full-time. The pastry partner is not an employee -- it is a wholesale relationship with a licensed bakery. Yara holds ServSafe certification and manages the food-safety program.",
    },
  ],

  "financial-plan-forecast": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Year one revenue target: $420,000, based on 200 cars per day at an average ticket of $7.20 and 292 operating days. Year one COGS: 28% of revenue. Labor at 32% including owner draw. Rent and occupancy at 8%. Net operating income at year end: approximately $67,000. Year two: 240 cars per day as regulars compound, revenue of $504,000, net income of $90,000 after increasing owner compensation.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Year one revenue: $390,000 based on 90 covers per day average by month four, 100 by month eight, at an average ticket of $11.50 across 350 operating days. COGS is 22% (coffee only, no food). Labor is 35% including Camille's draw. Occupancy is 9% of revenue. Year one net income: $52,000. Year two: 110 covers per day, revenue $490,000, net income $78,000. The model is not built on growth -- it is built on holding a high average ticket at a volume that two people can run.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Year one revenue: $480,000 based on 130 covers per day at $10.10 average ticket across 365 days. COGS at 30% (coffee plus bakery pastries). Labor at 38% including owner draws. Rent at 7%. Year one net income: $36,000 -- the model runs lean in year one while we build the community base. Year two: 145 covers per day, revenue $535,000, net income $72,000 as labor efficiency improves and the event program adds a new revenue stream.",
    },
  ],

  "financial-plan-unit-economics": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Average ticket: $7.20. Beverage COGS: $2.00 per drink (28% of ticket). Gross margin per drink: $5.20. At 200 cars per day, daily gross profit is $1,040. We need to cover $620 per day in fixed costs (rent, labor minimum, utilities) to reach breakeven. That means we break even at 120 cars per day -- a 40% cushion below our month-one target.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Average ticket: $11.50. COGS per drink: $2.50 (22%). Gross margin per drink: $9.00. We do not serve food, so every dollar of revenue runs at that margin. At 90 covers per day, daily gross profit is $810. Fixed costs per day: $680 (rent, two barista wages, utilities). Daily net at 90 covers: $130. The unit economics are tight at low volume and improve significantly as we approach 120 covers because fixed costs do not change.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Blended average ticket: $10.10 (coffee + pastry mix). Blended COGS: 30%. Gross margin per cover: $7.07. At 130 covers per day, daily gross profit is $919. Fixed costs: $810 per day (rent, three staff, utilities, bakery delivery). Net daily at 130 covers: $109. Breakeven is at 115 covers per day. We are targeting 130 as our month-three stabilized rate, which gives us a 13% cushion above breakeven.",
    },
  ],

  "financial-plan-break-even": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Breakeven is 120 cars per day at an average ticket of $7.20, which generates $864 in daily revenue. Fixed costs are $620 per day. At our projected opening rate of 150 cars per day, we clear breakeven by a 25% margin. The model does not become operationally fragile until we fall below 100 cars per day -- which is roughly half our target rate.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Breakeven is 76 covers per day at an average ticket of $11.50. Fixed costs are $680 per day. Opening-month target is 60 covers per day, which means we run below breakeven in month one. The reserve covers that. We expect to cross breakeven in month two and hold above it from month three forward.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Breakeven is 115 covers per day at a $10.10 average ticket. Fixed costs are $810 per day. We expect to cross that threshold by the end of month three as word of mouth compounds. Until then, the $40,000 reserve absorbs the shortfall. At 115 covers per day the business is sustaining itself. At 130 it is profitable. At 145 -- our year-two target -- it is healthy.",
    },
  ],

  "financial-plan-sensitivity": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Downside case: 160 cars per day (vs 200 projected) and average ticket of $6.80 (vs $7.20). Revenue drops from $420K to $344K. Net income drops from $67K to $18K. The business survives but year-two investment plans are deferred. Upside case: 240 cars per day by month nine instead of month twelve. Revenue hits $504K in year one instead of $420K. The extra cash funds a second lane installation without additional debt.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Base case: 90 covers per day, $11.50 ticket, $390K year-one revenue. Downside: 70 covers per day, $10.50 ticket, $283K revenue. At this level, Camille draws no salary and the reserve is depleted by month eight. The business needs to pivot -- either raise prices, add a second revenue stream, or accept that the neighborhood is not large enough for the model. Upside: 110 covers per day, $12.00 ticket, $471K revenue. Year-one net income climbs to $90K and the origin subscription launches ahead of schedule.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Base case: 130 covers per day, $10.10 ticket. Downside: 100 covers per day -- Hamtramck community adoption slower than expected. Revenue $365K vs $480K. The $40K reserve covers six months at this volume. At month six we reassess: add evening hours, pursue catering, or approach the CDFI lender about restructuring. Upside: 155 covers per day by month six. Revenue $572K. We launch the private events program in month eight instead of month fourteen.",
    },
  ],

  "financial-plan-financing": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Total startup cost: $140,000. Sources: $80,000 from South Valley Bank (SBA 7(a) microloan, 7-year term, 6.5% fixed), $60,000 from Jake's savings. No outside equity. The loan covers equipment, build-out, and two months of operating reserve. Jake's capital covers inventory, deposits, signage, and the remaining reserve. Monthly debt service starting month four: $1,260.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Total startup cost: $190,000. Sources: $110,000 from Craft3 (community development lender, 5-year term, 5.75% fixed), $80,000 from Camille's savings. No outside equity investors. Camille ruled out equity financing specifically to preserve her ability to make sourcing decisions without investor approval. Monthly loan payment beginning month three: $2,100.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Total startup cost: $165,000. Sources: $45,000 from Yara and Ben's combined savings, $120,000 from the Michigan Women's Foundation CDFI program (7-year term, 5.25% fixed, first six months interest-only). No outside equity. The interest-only period in months one through six reduces debt service during the revenue ramp-up phase. Monthly payment starting month seven: $1,780.",
    },
  ],

  "financial-plan-dscr": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Annual debt service: $15,120 (12 months at $1,260). Year one net operating income: $67,000. DSCR: 4.4x. The lender required a minimum DSCR of 1.25x. We are projecting 3.5x above that floor. Even in the downside case (160 cars per day), net income is $18,000 and DSCR is 1.2x -- just below the covenant. That is the scenario we would monitor closely.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Annual debt service: $25,200 (12 months at $2,100). Year one net operating income: $52,000. DSCR: 2.1x. Craft3 requires 1.15x minimum. We are well above that even in a downside scenario where covers per day fall to 80. At 80 covers net income would be roughly $30,000 and DSCR would be 1.2x.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Months one through six: interest-only payments of $525 per month. Full payments begin month seven at $1,780 per month. Annual debt service in year two (first full year of payments): $21,360. Year two projected net income: $72,000. DSCR year two: 3.4x. The lender covenant requires 1.2x. Even with the slow-ramp downside case, year-two DSCR stays above 1.5x.",
    },
  ],

  "financial-plan-capex-schedule": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Equipment: La Marzocca Linea Mini ($6,200), Mahlkonig E65S grinder ($3,100), blender and cold brew equipment ($1,800). Build-out: drive-through lane and canopy ($45,000), electrical upgrade ($8,500), signage ($4,200), POS and security install ($2,800). Total CapEx: $71,600. All equipment ordered eight weeks before opening. Build-out scheduled over six weeks starting ten weeks before the target opening date.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Equipment: Slayer Single Group espresso machine ($9,800), two Mahlkonig EK43s ($4,200 total), Acaia scales x4 ($960), Chemex and V60 inventory ($600). Build-out: contractor renovation of leased 900 sq ft ($62,000), custom bar fabrication ($14,000), seating and furniture ($8,000), signage ($2,500). Total CapEx: $102,060. Equipment lead times: 10 to 12 weeks for the Slayer. Ordered concurrent with lease signing.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Equipment: La Marzocca Linea PB 2-group ($14,500), two Mahlkonig E80S grinders ($5,600), refrigeration and pastry case ($6,800), POS system ($3,200). Build-out: contractor renovation of 1,400 sq ft ($55,000), ADA compliance upgrades ($8,000), community board installation ($1,200), furniture and seating ($9,500). Total CapEx: $103,800. All major equipment ordered 10 weeks before the opening date. Build-out begins 12 weeks prior.",
    },
  ],

  "financial-plan-depreciation": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Depreciable CapEx: $71,600 total. Equipment ($11,100) depreciated on a 5-year straight-line schedule: $2,220 per year. Build-out and improvements ($60,500) depreciated over 15 years as leasehold improvements: $4,033 per year. Total annual depreciation: $6,253. Depreciation is a non-cash expense that reduces taxable income without affecting cash flow.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Equipment ($15,560) depreciated over 5 years straight-line: $3,112 per year. Leasehold improvements ($86,500) depreciated over 15 years: $5,767 per year. Total annual depreciation: $8,879. Camille will work with her accountant to evaluate whether Section 179 expensing of equipment in year one reduces tax liability more than the standard depreciation schedule.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Equipment ($30,100) depreciated over 5 years straight-line: $6,020 per year. Leasehold improvements ($73,700) depreciated over 15 years: $4,913 per year. Total annual depreciation: $10,933. The CDFI lender reviewed the depreciation schedule as part of loan underwriting. Total depreciable base is $103,800.",
    },
  ],

  "financial-plan-working-capital": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Operating reserve at opening: $30,000. This covers three months of fixed costs ($620 per day x 90 days = $55,800) at a projected miss of 30% below target revenue. Additional float: Jake has a $15,000 personal line of credit available as a backstop he has not drawn on. Inventory cycle: weekly coffee order, daily pastry delivery paid on net-14 terms. The working capital requirement is modest because we do not carry significant perishable inventory.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Reserve at opening: $25,000. Fixed costs per month: $20,400. The reserve covers roughly five weeks of operating losses if revenue comes in at zero -- a worst case used for stress testing, not a realistic projection. Green coffee inventory: $4,800 at any given time (60-day supply). Supplier payment terms: net-30 with the importer. No food inventory to spoil. Working capital requirement is low because the model is coffee-only with a single supplier.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Reserve at opening: $40,000. Monthly fixed costs at full staffing: $24,300. The reserve covers roughly six weeks of operating below breakeven, which we model as the end of month two before word-of-mouth compounds. Pastry inventory: delivered daily, paid on net-7 terms, no significant carry. Coffee inventory: weekly order, two-week float. The CDFI lender required the $40,000 reserve as a condition of the loan and it is shown as a restricted use of proceeds in the funding table.",
    },
  ],

  "financial-plan-statements": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Year one projected income statement: Revenue $420,000, COGS $117,600 (28%), Gross Profit $302,400, Labor $134,400 (32%), Rent and Occupancy $33,600 (8%), Operating Expenses $67,200 (16%), Net Operating Income $67,200. Year-end cash: $52,000 after debt service of $15,120. Balance sheet at year end: equipment and improvements (net of depreciation) $65,347, cash $52,000, loan balance $65,800.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Year one: Revenue $390,000, COGS $85,800 (22%), Gross Profit $304,200, Labor $136,500 (35%), Occupancy $35,100 (9%), Other Expenses $80,600 (21%), Net Income $52,000. Year-end cash after debt service: $26,800. Balance sheet: equipment and improvements (net of depreciation) $93,181, cash $26,800, loan balance $88,400.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Year one: Revenue $480,000, COGS $144,000 (30%), Gross Profit $336,000, Labor $182,400 (38%), Occupancy $33,600 (7%), Other Expenses $84,000 (17.5%), Net Income $36,000. Year-end cash after interest-only payments (months 1-6) and partial full payments (months 7-12): $28,500. Balance sheet: assets $95,000 (net of depreciation), cash $28,500, loan balance $116,000.",
    },
  ],

  "appendix-monthly-statements": [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Monthly revenue ramp: Month 1 $22,000 (100 cars/day avg), Month 2 $26,400 (120 cars/day), Month 3 $33,000 (150 cars/day), Month 4 $38,500 (175 cars/day), Month 5-12 average $40,700 (185 cars/day). Labor stays at $11,200 per month through month six, increases to $12,600 in month seven when Jake reduces his own bar hours. Rent is flat at $2,800 per month through year one.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Monthly revenue ramp: Month 1 $16,100 (50 covers/day avg), Month 2 $23,000 (70 covers/day), Month 3 $29,300 (90 covers/day), Month 4-6 average $33,400 (100 covers/day), Month 7-12 average $36,800 (110 covers/day). Labor is $11,375 per month months 1-2 (Camille only), increases to $14,300 in month 3 when the second barista joins. Rent is $2,900 per month.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Monthly revenue ramp: Month 1 $24,000 (80 covers/day avg, reduced hours), Month 2 $30,300 (100 covers/day, full hours), Month 3 $39,400 (130 covers/day), Months 4-12 average $43,600 (145 covers/day). Labor steps up from $14,400 per month at opening to $16,200 in month four as one part-time shift is added. Rent is flat at $2,800 per month.",
    },
  ],
};
