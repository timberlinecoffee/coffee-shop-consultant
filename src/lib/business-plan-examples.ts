// TIM-1315: Fictional worked examples for each business plan section.
// Summit Street Coffee — Dana Kessler, Flagstaff AZ.
// Source: TIM-1313 content doc. Used as reference UI in the workspace.
// TIM-1498: Rekeyed to the two-level taxonomy. Where the new structure merges
// two prior sections (e.g. Execution > Operations = Location + Equipment), the
// example concatenates the originals under heading separators so the reader
// sees what content lands where.

import type { BusinessPlanSectionKey } from "./business-plan";

// TIM-3575: Optional sections (isOptional) have no pre-written example, so
// the record is now Partial — consumers must handle missing keys gracefully.
export const SUMMIT_STREET_EXAMPLES: Partial<Record<BusinessPlanSectionKey, string>> = {
  "executive-summary": `Summit Street Coffee will open in downtown Flagstaff, Arizona in March 2027 as a 2,200-square-foot specialty coffee shop serving single-origin espresso drinks, pour-overs, and small-batch baked goods made in-house each morning. The shop will seat 80 guests and operate seven days a week from 6:30 a.m. to 6:00 p.m.

The owner, Dana Kessler, has spent eight years in specialty coffee, the last four as a shift supervisor at Bird Rock Coffee Roasters in Phoenix. She has sourced beans directly from farms in Guatemala and Ethiopia, trained baristas across two locations, and run daily operations for a shop doing $600,000 per year. She is ready to own what she already runs.

Flagstaff has one serious competition gap. The two downtown coffee shops within walking distance of NAU's campus cater to speed and convenience: a Starbucks on Milton and a drive-through espresso chain on Route 66. No shop in the area offers the full specialty experience -- whole-bean brewing protocols, seasonal menus tied to harvest cycles, or counter conversation that turns a first-time visitor into a regular. That gap is Summit Street's market.

The business requires $280,000 to open: $180,000 from an SBA 7(a) loan, $60,000 from Dana's personal savings, and $40,000 from two family investors structured as subordinated debt. At projected revenue of $45,000 per month by month six and $65,000 per month by month twelve, the shop reaches cash-flow breakeven at month eight and retires investor principal within three years.`,

  "opportunity-problem-solution": `The customers Summit Street is built for already exist in Flagstaff -- they just leave the city to get what they want. NAU faculty members drive to Sedona for a morning pour-over and end up working from those cafes the rest of the day. Remote workers at the downtown coworking space order delivery from Starbucks because there is no specialty option that will hold a table for three hours. Tourists driving through stop at a chain on Route 66 because they cannot find a sit-down option near the historic district. The problem is not a lack of coffee shops; it is a lack of a serious one in walking distance of where this market actually lives and works.

That gap exists because the existing operators chose other priorities. The Starbucks on Milton optimizes for drive-through throughput. The Route 66 chain has no seating at all. Campus Coffee on Knoles Drive opened around iced drinks and sandwiches and has not rotated its menu since 2021. None of them are bad businesses, but none of them are answering the specific demand Dana has watched for six years: people who want a single-origin pour-over, a quiet table for two hours, and a barista who can talk about where the beans came from.

Summit Street solves that problem directly. Eight espresso drinks, three pour-overs rotated seasonally, beans sourced and approved by Dana from a partner roaster in Tucson, a room sized for 80 with a communal table in the center and quiet two-tops along the windows. Counter service so the staff stays close to the bar. No QR menus. No loyalty app. The shop is built around the customer behavior that already exists in this market but has no good answer nearby.`,

  "opportunity-target-market": `Flagstaff is a city of 78,000 permanent residents, but that number understates the actual market. Northern Arizona University enrolls approximately 28,000 students, the majority of whom live on or near campus within a 10-minute walk of the proposed Summit Street location. Grand Canyon National Park draws 6 million visitors per year, many of whom pass through Flagstaff as their first or last overnight stop. The city also has a growing remote-work population drawn by its elevation, outdoor recreation, and relative affordability compared to Phoenix and Tucson. Summit Street's core addressable market is the 30,000 to 40,000 people who live, work, or spend meaningful time within a half-mile radius of West Summit Avenue on any given weekday.

The customer opportunity splits into three segments. The first is the Daily Regular: NAU faculty, staff, and upperclassmen who want a consistent, high-quality morning or afternoon coffee and are willing to pay $6 to $8 for a well-made drink. This segment drives predictable weekday revenue and responds to consistency above all else. The second is the Remote Worker who needs reliable wifi, enough seats, and a reason to stay two to three hours; this customer spends $10 to $15 per visit and comes back two to three times per week. The third is the Tourism-Adjacent Visitor -- a couple driving through Flagstaff who wants a good local coffee shop and is willing to spend $20 to $30 on drinks and pastries before continuing their trip.

The specialty coffee category grew at 7.1 percent annually from 2019 to 2024, driven by a consumer preference shift toward quality over convenience. Flagstaff's demographics -- educated, outdoor-oriented, median household income of $48,000 for permanent residents and significantly higher for faculty and the professional class -- match the profile of specialty coffee's strongest buyer segment.

Daypart traffic skews toward the morning rush between 7:00 and 9:30 a.m. as the campus and downtown professional class arrive at work, then drops through midmorning before a sustained midday wave from 11:00 a.m. through 2:00 p.m. driven by remote workers and tourists. Afternoon traffic returns at 3:00 p.m. as students leave class. Dana's projections weight 55 percent of daily transactions to the morning rush and 30 percent to the midday wave.

Dana has spoken with six NAU faculty members and four local business owners as informal customer discovery. The consistent feedback: people drive to Tempe or Sedona when they want a serious coffee shop. That trip is the market Summit Street is replacing.`,

  // TIM-2341: dedicated Risks section example (replaces the inline risk
  // paragraph previously buried in Statements). Four categorized groupings.
  "opportunity-risks": `Summit Street carries a six-month operating reserve, $1.5M in general-liability coverage through Hiscox, an equipment service contract with quarterly preventive maintenance, and a lease that includes a personal-guarantee carve-out at year three. Risks named below are addressed by these standing coverages or by named contingencies.

**Operational risks**

- Espresso equipment failure in the first 90 days: covered by the La Marzocca quarterly preventive maintenance contract with Espresso Exchange in Phoenix, plus a $4,800 manual lever backup kept in the back office.
- Opening-Key Barista departure during the opening quarter: Dana retains direct bar coverage four to five days per week through month six, eliminating the single-point-of-failure exposure.
- Long-lead-time equipment slippage: La Marzocca and Mazzer orders placed concurrent with permit application; ten-week lead-time risk is sequenced ahead of the construction critical path.

**Market risks**

- Ramp slower than projection through month six: $90,000 reserve (three times month-one cash burn) absorbs a 30% miss without a second capital event.
- New entrant with similar positioning: the West Summit Avenue site is the only catchment property with the right size, lease terms, and walk-in traffic; Dana's eight-year operating record raises the displacement bar.
- Seasonal traffic dip in summer (NAU break): mitigated by tourist traffic from the Grand Canyon corridor and the local remote-work segment that does not vary with academic calendar.

**Financial risks**

- Cost inflation outpacing the 3% lease escalator: Prism Coffee Works (Tucson) contract caps green-coffee price pass-through at 2% per year through 2028; labor inflation is the unhedged exposure and is sized into the year-three pro-forma.
- DSCR squeeze if SBA principal payments begin before month four revenue arrives: loan structure includes interest-only months 1–3 so DSCR is computed against month-four revenue, not opening revenue.
- Working-capital squeeze on supplier reorders: $18,000 initial inventory + 30-day vendor terms with Prism produces a 60-day cash float before second reorder.

**Regulatory risks**

- Health-code certificate delays: Dana holds an active Maricopa County food manager certificate, accelerating Coconino County reciprocity.
- Liquor licensing not applicable (Summit Street is beer- and wine-free at opening).
- Lease assignment clause: contains a one-time owner-substitution right in years three through five that limits enterprise-sale flexibility but preserves operating continuity.
- Employment-law: payroll is run through Gusto with Arizona-specific compliance built in.`,

  "opportunity-competition": `The direct competition within a half-mile radius of West Summit Avenue is thin. Starbucks on Milton Road serves approximately 400 transactions per day based on Dana's observation count across four weekday visits, but the volume is concentrated in drive-through and mobile order; the cafe seating rarely exceeds half capacity. The drive-through espresso chain on Route 66 has no seating at all and competes purely on speed. Campus Coffee on Knoles Drive, the only independent shop near campus, opened in 2019 and built its business around iced drinks and sandwich wraps; it does not do pour-overs, does not rotate its bean program, and has not changed its menu since 2021. None of them serve the customer who wants a single-origin pour-over and a quiet table for two hours.

The adjacent competition absorbs the same intent without being a coffee shop. Macy's European Coffee House serves filter coffee in a 1980s cafe layout that draws an older regulars crowd. Bookmans Entertainment Exchange has a counter cafe and free wifi that captures the cheapest-table-in-town segment. The downtown public library hosts the work-from-home crowd that does not want to pay for coffee at all. Each of these captures some share of the demand Summit Street targets, but none of them deliver on the specialty product Dana intends to serve.

The gap Summit Street fills is the combination none of these competitors offer: a specialty-grade product, a room sized for sustained occupancy, a sourcing program that gives the staff and the regulars something to talk about, and a location inside walking distance of campus and the downtown professional core. The competitive risk is a new entrant with similar positioning. Two factors mitigate it: the West Summit Avenue site is the only one in the catchment with the right size, lease terms, and walk-in traffic, and Dana's eight-year operating record at Bird Rock raises the bar a copycat would need to clear to displace her.`,

  "execution-marketing-sales": `## Menu & Pricing

Summit Street's opening menu will have 12 items: eight espresso-based drinks, three brewed single-origin options available by pour-over, and one house cold brew made in-house in 24-hour batches using a 10-gallon immersion system. The menu will not include blended drinks, flavored syrups beyond vanilla and hazelnut, or any tea or matcha program at launch. Those categories might come later; they are not on the opening menu because they take attention and equipment away from what Summit Street actually does well.

The espresso program runs on a two-group La Marzocca Linea PB and a Mazzer grinder. The house espresso blend is sourced from Prism Coffee Works in Tucson, a specialty roaster Dana has worked with since 2021. The pour-over bar offers three single-origin options at any time, rotated seasonally: one natural-process Ethiopian, one washed Central American, and one wildcard chosen by Dana based on what is interesting at the source level during that harvest cycle. Pour-overs are made on Kalita Wave brewers and priced at $7 to $9 depending on the bean's cost.

Pricing reflects what specialty coffee actually costs and the customer segment being served. A standard 12-ounce latte will be $6.50. A 16-ounce cold brew with milk will be $6.00. A pour-over will range from $7.00 to $9.00. A cortado will be $5.25. These prices are at or slightly above the Flagstaff market but below what comparable specialty shops charge in Phoenix and Tucson.

## Marketing Plan

Summit Street will begin building an audience three months before opening. Dana will document the build-out on Instagram under @summitstreetcoffee, posting two to three times per week: photos of the espresso bar being installed, early test shots from the La Marzocca, introductions to the farmers whose beans will be on the opening menu. The goal on opening day is 400 to 600 followers who feel like they have been watching something get built, not just another coffee shop announce itself.

The opening event will be simple. Dana will invite 40 to 50 people for a private soft-open the night before the public opening: NAU faculty contacts, local business owners, the contractor and his crew, neighbors on Summit Avenue. No press release. No promotional discount. Just a full bar running and a plate of pastries. The people in that room are the word-of-mouth network for the first 60 days.

After opening, the ongoing marketing approach has two parts. The first is operational: be specific enough about what the shop does that the people who love it have something concrete to recommend. The second part is community presence: one NAU student club sponsorship per semester ($200 to $400 in free drinks), active participation in the downtown merchants association, and a standing 20 percent discount for NAU faculty during off-peak hours. No paid advertising in year one.`,

  "execution-operations": `## Location & Real Estate

Summit Street Coffee is leasing 2,200 square feet at 14 West Summit Avenue in downtown Flagstaff, Arizona. The location sits two blocks from Northern Arizona University's main entrance and one block from the downtown transit hub, placing it directly in the daily path of commuter and student traffic the shop is designed to serve.

The lease term is five years with one five-year renewal option. Base rent is $4,800 per month, or $2.18 per square foot -- below the downtown Flagstaff commercial average of $2.60 to $3.20. The landlord is providing a $30,000 tenant improvement allowance and a two-month rent abatement during construction. Annual rent increases are capped at 3 percent. Dana reviewed the lease with a commercial real estate attorney before signing.

The space was previously occupied by a retail clothing boutique and required full interior demolition. The bones are good: 12-foot ceilings, two ADA-compliant restrooms, a functional HVAC system, and rear alley access for daily dairy and supply deliveries. Electrical service required an upgrade to 200-amp to handle the espresso equipment and commercial kitchen. That upgrade is included in the landlord's improvement allowance.

## Equipment & Supplies

The build-out and equipment budget is $157,000. That covers build-out labor and materials beyond the landlord's $30,000 allowance ($62,000), the full equipment package ($95,000), initial inventory and first-month supplies ($18,000), and pre-opening costs including licenses, permits, and soft-launch expenses ($15,000). The operating reserve of $90,000 is budgeted separately.

The espresso program centers on a two-group La Marzocca Linea PB at $18,500, paired with two Mazzer Major grinders -- one for the house espresso blend, one for single-origin pour-over output. The brew bar runs four Kalita Wave 185 stations. Cold brew is produced in-house using a 10-gallon Toddy commercial immersion system cycling a 24-hour batch daily.

The production kitchen houses a commercial convection oven, a 20-quart stand mixer, a proofing cabinet, and a 6-foot stainless prep table. The baker owns this section of the kitchen from 5:00 a.m. to 10:00 a.m. Major equipment is covered by service contracts: the La Marzocca through Espresso Exchange in Phoenix with quarterly preventive maintenance included, the commercial oven through the manufacturer's extended warranty.`,

  "execution-milestones-metrics": `Summit Street Coffee's path from lease signing to opening day covers six months and 22 discrete milestones. The sequence reflects what Dana has watched happen at two other build-outs and is adjusted for the specific complexity of this space.

The first three months (August to October 2026) are dedicated to construction, permitting, and equipment procurement. Build-out begins the week the lease is signed. The La Marzocca and Mazzer grinders have 10-week lead times and are being ordered concurrent with the permit application. Failure to have espresso equipment on-site before training starts pushes the opening by two to four weeks, which is why both are in the first purchase cycle.

Training begins in November 2026, six weeks before the projected soft open. Dana will train the Opening-Key Barista to run the bar independently by the end of week two. The baker joins in week three for a three-week test run of the opening baked-goods lineup. By December, every shift has been run at least twice in a simulated full-service environment.

The public opening is planned for the first week of March 2027, preceded by a private soft open for 40 to 50 invited guests in late February. From day one, Dana will track five operating metrics weekly: transactions per day, average ticket, opening waste percentage, staff retention through month three, and the ratio of new-to-returning faces during the morning rush. The plan is to publish those numbers to herself every Sunday night and adjust the schedule, menu, or training cadence in response.`,

  "company-overview": `Summit Street Coffee, LLC will be incorporated in Arizona as a single-member limited liability company in August 2026. The shop will occupy 2,200 square feet at 14 West Summit Avenue, two blocks from Northern Arizona University's main entrance and one block from the downtown transit hub. The space includes a front-of-house with 80 seats, a full espresso bar with four group heads, a brew bar with four pour-over stations, and a production kitchen with commercial oven, proofer, and mixer.

The concept came from an observation Dana made over three years of running a shift at Bird Rock: most coffee shops force a choice between atmosphere and quality. The shops that feel good to sit in serve mediocre espresso. The shops that pull a technically correct shot feel like airport kiosks. Summit Street will not force that choice.

In practice, that means three things. First, the menu will be short: eight espresso drinks, three pour-over options, one cold brew, and one rotating seasonal offering. Every drink is made from beans sourced and approved by Dana personally, roasted by a partner roaster in Tucson. Second, the baked goods will be made in-house each morning by a dedicated baker -- two or three items per day, rotated weekly, nothing from a commissary. Third, the physical space will feel like a room someone actually lives in: mismatched chairs, local art on a rotating display, a long communal table in the center for solo workers and small groups.

The shop will be open seven days a week from 6:30 a.m. to 6:00 p.m. Counter service is the primary model, with one to two staff members circulating tables during peak hours to clear dishes and check on guests. There will be no tableside ordering, no QR menus, and no loyalty app.

Dana's direct involvement in daily operations is not optional and not temporary. She will be behind the bar four to five days a week for the first two years. The shop's quality depends on her being present while the team is trained and the culture is set.`,

  "company-team": `Dana Kessler, 34, is the founder and will serve as Owner-Operator. She has worked in specialty coffee for eight years. From 2018 to 2022 she worked as a barista and then Lead Barista at Lubbock + Greer Coffee in Phoenix, a single-location independent shop known for its direct-trade sourcing program. In 2022 she joined Bird Rock Coffee Roasters as a Shift Supervisor, managing daily operations at a 1,800-square-foot location doing $550,000 in annual revenue. At Bird Rock she managed a staff of six, oversaw weekly ordering, and was the primary contact for the seasonal bean rotation. She is leaving on good terms; two members of the Bird Rock management team have agreed to serve as informal advisors.

Dana does not have a business degree. She completed a 12-week Entrepreneurship Bootcamp at NAU's College of Business in fall 2025. Her formal financial modeling skills are limited; she has worked since January 2026 with a SCORE mentor, Harriet Odom, a retired regional bank VP with 20 years of commercial lending experience, who reviews Dana's financials monthly at no charge. Dana has also consulted with a Flagstaff commercial real estate attorney on the lease and with a local SBA lender on the loan structure.

The organizational structure at opening will be flat:

- **Owner-Operator (Dana Kessler):** all management, menu decisions, sourcing, and scheduling
- **Opening-Key Barista (to be hired, Q4 2026):** opens the shop four days per week; primary espresso trainer for new hires
- **Baristas x2 (to be hired, Q4 2026):** mid-shift coverage, cleaning, and closing
- **Baker (to be hired, Q4 2026):** 5:00 a.m. to 10:00 a.m. daily; baking and case management
- **Weekend Floater (to be hired, Q1 2027):** added after the first four weeks once weekend rush volume is understood

There are no plans to hire above the Opening-Key Barista in year one. Dana's goal is to build operational knowledge in herself before she delegates it.`,

  // TIM-2341: lender-ready financial-plan section examples. Auto-content is
  // rendered by the assemblers from plan_state; these strings are reference
  // narrative the workspace UI shows alongside the editor.
  "financial-plan-unit-economics": `Summit Street's unit economics are simple to verify against this plan. The opening average ticket is $10.50 and rises to $11.00 by month twelve. Steady-state customer volume after the ramp lands at 200 transactions per day across seven open days, producing $2,200 of daily revenue and roughly $66,000 per month at an open-day count of seven and the 4.33 weeks-per-month convention.

The daypart concentration drives the staffing posture rather than the headline revenue. The morning rush from 7:00 to 9:30 a.m. delivers 55 percent of daily revenue at three baristas on the bar; the midday wave from 11:00 to 2:00 delivers 30 percent at two baristas; the afternoon return from 3:00 forward delivers the remaining 15 percent at two baristas during the school year and one barista during summer break.

The product mix is espresso-heavy (60 percent of revenue) with food at 30 percent and retail beans at 10 percent. The blended COGS rate produced by that mix sits at 30 percent for year one, which the projected P&L confirms line-for-line.`,

  "financial-plan-break-even": `Summit Street reaches steady-state break-even at approximately $42,000 in monthly revenue, or roughly 130 transactions per day at the $10.50 average ticket. The projection lands above that line by month seven at 160 transactions per day, and crosses the cash-flow break-even mark in month eight on the slower-ramp scenario the SBA underwriter prefers.

The two operational levers most likely to close the gap if the ramp slips are average-ticket lift through menu engineering (a $0.40 ticket lift moves break-even by roughly 15 customers per day) and a daypart staffing trim during the afternoon shoulder. Both are reversible decisions, made monthly against the prior month's tracked metrics.`,

  "financial-plan-sensitivity": `Baseline year-one net income is modeled at break-even within plus or minus 5 percent. The lender stress test surfaces two scenarios that swing the headline meaningfully.

A 20 percent relative increase in COGS (30 percent baseline rising to 36 percent) drops year-one net income by roughly $35,000. That is the scenario the supplier contract with Prism Coffee Works at a 2 percent annual cap explicitly hedges against, and the eighteen-month reserve through the six-month operating buffer absorbs the remainder. A three-month slip on the ramp drops year-one net income by approximately $48,000; the six-month operating reserve is sized at three times projected month-one cash burn precisely for this scenario, and Dana's own salary deferral through month three is the second contingency.

The shop survives every other scenario in the table without a second capital event. A 10 percent ticket lift produces approximately $25,000 of net income improvement; a 20 percent COGS reduction produces a similar lift but is harder to underwrite to.`,

  "financial-plan-dscr": `The SBA 7(a) loan from Pinnacle Bank carries a 10-year amortization at the prevailing SBA rate. Year-one DSCR lands at 1.45×, comfortably above the 1.20× commercial / SBA threshold, and rises to 1.95× by year three as the revenue ramp completes and the lease escalator stays inside the 3 percent annual cap.

The interest-only structure for the first three months of debt service is the single lender-side concession that holds year-one DSCR above the threshold during the ramp; without it, year-one DSCR would compress to approximately 1.12×. Dana's personal guarantee covers the full SBA principal balance; the family debt at 5 percent is subordinated to the SBA position and is unsecured.`,

  "financial-plan-capex-schedule": `The capital expenditure budget totals approximately $157,000 across nine line items. The four largest are the La Marzocca Linea PB at $18,500, the two Mazzer Major grinders at $5,800 combined, the production kitchen equipment package (commercial oven, proofer, stand mixer, stainless prep table) at $32,400, and the build-out beyond the landlord's $30,000 allowance at $62,000. Smaller line items cover the brew bar (four Kalita Wave stations at $480 total), the 10-gallon Toddy cold-brew system at $1,200, the point-of-sale and back-office technology stack at $8,600, and reach-in refrigeration at $11,500.

CapEx is funded primarily by the $180,000 SBA loan with the equipment portion drawn at closing; the build-out spend is sequenced against the construction draw schedule. Dana's $60,000 founder equity is committed against the working-capital reserve and the pre-opening marketing line rather than the depreciable asset base.`,

  "financial-plan-depreciation": `Annual depreciation expense is approximately $18,400 for year one, computed straight-line across the CapEx schedule. The two major buckets are equipment at seven-year useful life (espresso program, grinders, kitchen production equipment, refrigeration) and the build-out at fifteen-year useful life. The technology stack at three-year life adds a small annual line.

Depreciation is a non-cash expense and is added back to EBITDA on the cash flow statement. It reduces taxable income but has no effect on the DSCR computation against EBITDA shown elsewhere in this plan.`,

  "financial-plan-working-capital": `Summit Street operates with food-service-standard working-capital posture. Inventory days on hand sit at ten (small dairy and pastry batches, ten-day raw-bean cycles), days payable at thirty (Prism, dairy, and produce vendor terms), and days receivable at one (counter service, no wholesale accounts at opening).

Against year-one daily COGS of approximately $720 and daily revenue of approximately $2,200, that produces an inventory carry of roughly $7,200, vendor payables of roughly $21,600, and accounts receivable near zero. Net working capital tied up in operations at year-one steady state is therefore negative — meaning vendor terms fund the inventory drop and a small portion of working capital. The $90,000 operating reserve in the uses-of-funds line covers month-one cash burn before the second supplier cycle catches up, and is explicitly NOT the working-capital line.`,

  "financial-plan-forecast": `Summit Street's financial forecast is built on five operating assumptions: an opening average ticket of $10.50 rising to $11.00 by month twelve, 80 transactions per day at opening growing to 200 by month twelve, opening hours of 6:30 a.m. to 6:00 p.m. seven days a week, three FTE on the floor during peak shifts and two on shoulder shifts, and a six-month ramp curve modeled on three comparable independent shops Dana contacted directly.

Revenue by month follows the ramp curve closely. Month one targets approximately $24,000 in net revenue, scaling to $42,000 by month three, $52,000 by month six, and $66,000 by month twelve. The shape is steepest in months one through three as word-of-mouth from the soft-open audience compounds, then flatter through months four through six as the daypart pattern stabilizes.

Expenses by month track revenue with a lag. Payroll lands at 38 to 42 percent of revenue once the team is fully staffed in month two. Rent and occupancy hold flat at $4,800 per month plus utilities and insurance averaging $1,400. COGS sits at 28 to 32 percent of revenue. Marketing spend is concentrated in months minus three through one and tapers to near zero from month four onward.

Net profit by year one is modeled at break-even within plus or minus 5 percent. Year two reaches $48,000 in net profit on $760,000 in revenue. Year three reaches $94,000 in net profit on $850,000 in revenue. Years four and five are not modeled in detail; the financing plan is sized to year three milestones.`,

  "financial-plan-financing": `Summit Street Coffee is seeking a total of $280,000 to fund the opening. The capital is already partially committed: $60,000 from Dana Kessler's personal savings and $40,000 from two family investors structured as subordinated debt. The remaining $180,000 is being requested as an SBA 7(a) small business loan through Pinnacle Bank in Flagstaff.

The SBA loan application was submitted in March 2026. Dana received conditional interest in April and expects a lending decision by July. The loan is structured with a 10-year amortization at current SBA rates, with principal and interest payments beginning in month four post-closing. The family debt is structured at 5 percent annual interest with a three-year balloon payment, no equity stake, and no operational role for either investor.

The $280,000 covers: equipment at $95,000, build-out beyond the landlord allowance at $62,000, initial inventory and first-month supplies at $18,000, pre-opening marketing and soft-launch costs at $15,000, and a six-month operating reserve at $90,000. The reserve is sized at three times projected month-one cash burn. Dana has reviewed this structure with her SCORE mentor and her SBA lender.

The use of SBA financing rather than outside equity reflects a deliberate decision to retain full ownership. Dana is not opposed to outside investors in principle, but she has seen what happens to coffee shop culture when operators answer to non-operator stakeholders. At this stage, the business is worth funding on debt terms. Equity is a conversation for year three if the business warrants a second location.`,

  "financial-plan-statements": `Summit Street will require $280,000 to reach opening day. That total breaks down as: $95,000 for equipment, $62,000 for build-out and tenant improvements beyond the landlord's $30,000 allowance, $18,000 for initial inventory and the first 30 days of supply, $15,000 for pre-opening marketing and soft-launch costs, and $90,000 held as a six-month operating reserve. The reserve is sized at three times projected month-one cash burn -- not two, which would leave no room for a slower-than-expected ramp.

Revenue is projected on a per-transaction model. Month one targets 80 transactions per day at an average ticket of $10.50, producing approximately $24,000 in monthly revenue. Month six targets 160 transactions per day at $10.75, producing approximately $52,000. Month twelve targets 200 transactions per day at $11.00, producing approximately $66,000. These projections were benchmarked against self-reported transaction volume from three comparable independent specialty shops contacted directly by Dana.

The cost structure at opening: food and beverage COGS at 28 to 32 percent of revenue, payroll at 38 to 42 percent, occupancy at 12 to 14 percent, and all other operating expenses at 8 to 10 percent. Total cost structure in month one is 86 to 98 percent of projected revenue. The shop will not be profitable in month one, and is not expected to be.

Gross profit margin holds at 68 to 72 percent across the first three years. Operating income turns positive at month eight and compounds modestly through year one as the labor cost percentage drifts down with rising volume.

The cash-flow breakeven point is projected at month eight. This assumes the revenue ramp tracks within 15 percent of projection through month six. Dana will not draw a salary in months one through three. Beginning in month four she will pay herself $3,200 per month. Her target owner compensation once the shop is stable is $60,000 to $70,000 per year, which she expects to reach by the end of year two if revenue tracks to plan.

The owner acknowledges the principal risks: a slower-than-expected ramp through month six, an espresso equipment failure in the first 90 days, or a key staffing departure during the opening quarter. The operating reserve and the service contracts on major equipment are sized to absorb any one of these without a second capital event.`,

  "appendix-monthly-statements": `Monthly profit and loss, cash flow, and balance sheet statements for year one appear on the following pages. Five-year annual summary precedes the month-by-month tables. All figures are in the plan's reporting currency and reflect the assumptions in the Financial Plan section.`,
};
