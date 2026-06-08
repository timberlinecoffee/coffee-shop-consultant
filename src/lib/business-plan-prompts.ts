// TIM-2331: Shared prompt builder for business-plan AI section generation.
// Extracted from /api/business-plan/generate so /regenerate-all can reuse the
// exact section specs and voice rules without duplicating them.

export const BP_SHARED_RULES = `Voice and style rules:
- Write in the founder's plain voice — direct, confident, operational. Not corporate. Not AI-sounding.
- Coffee-specific vocabulary (espresso, pour-over, daypart, CAM, barista, neighborhood traffic) — never generic restaurant language.
- No em dashes anywhere in the text. Use a regular dash with spaces ( -- ) if you need a pause.
- No AI vocabulary: leverage, unlock, embark, elevate, delve, seamlessly, robust, comprehensive, innovative, holistic, synergy, passionate.
- No filler phrases: "high-quality experience," "welcoming space," "wide variety," "we pride ourselves on," "is committed to."
- Title case for headings and named items (role titles like Opening-Key Barista, equipment names, drink names, place names, persona names). Body prose is sentence case.
- Specific numbers throughout -- not "significant revenue" but the actual dollar figure from the data.
- Generate, never refuse. This is a drafting tool and the founder reviews and edits every draft before it is saved, so always produce a complete section. When the section-specific data is thin, write the strongest draft you can from the wider plan context and founder profile below, making reasonable assumptions and grounding them in coffee-business norms. Do not reply that there is not enough context and do not tell the founder to go fill in a workspace first.
- Return only the section text. No preamble, no labels, no explanation, no notes about what is missing.`;

export const BP_SECTION_SPECS: Record<string, string> = {
  "executive-summary": `Length: 250 to 350 words. Four paragraphs, no bullet lists.
Structure: Paragraph 1 -- what the business is, where it is, when it opens. Paragraph 2 -- who the owner is and why they can do this (specific roles, years, numbers). Paragraph 3 -- the market gap the shop fills (name competitors and say what they do not do). Paragraph 4 -- the money: how much is needed, where it comes from, and what it buys.
Do NOT start with "I" -- start with the shop name or a specific claim.
Any paragraph that could describe any coffee shop is too generic. Reject sentences where the owner name and city could be swapped without changing meaning.`,

  "opportunity-problem-solution": `Length: 250 to 400 words. Three to four paragraphs.
Structure: Paragraph 1 -- the customer problem in concrete terms (who has it, when, where, and what they do today instead). Paragraph 2 -- why that gap exists in this specific catchment (what the existing options miss). Paragraph 3 -- the solution the shop offers and why it directly addresses the problem named in paragraph 1. Paragraph 4 (optional) -- evidence the problem is real (customer conversations, observed traffic patterns, comparable markets).
Name the actual customer behavior. Avoid "we solve the lack of community" or any abstraction that could describe any business. Tie the solution back to the specific problem statement, not a generic value proposition.`,

  "opportunity-target-market": `Length: 400 to 500 words. Four to five paragraphs.
Structure: Paragraph 1 -- the addressable market with specific numbers (population, student enrollment, visitor counts, daytime workers). Paragraphs 2 and 3 -- customer segments: describe two or three buyer types with specific spending behavior, visit frequency, and what they want, not demographic abstractions. Paragraph 4 -- daypart and traffic patterns specific to the location. Paragraph 5 -- any primary research or validation the owner has done.
No broad national market size figures that don't connect to the specific location. Tie every number to the catchment.`,

  "opportunity-competition": `Length: 300 to 450 words. Three to four paragraphs.
Structure: Paragraph 1 -- direct competitors in the catchment area (name each, describe what they actually do, price point, observable traffic). Paragraph 2 -- adjacent competitors (drive-throughs, fast-casual, grocery coffee, work-from-home setups) that absorb the same customer intent. Paragraph 3 -- the specific gap this shop fills that none of them serve. Paragraph 4 (optional) -- competitive risks and how the shop mitigates them.
Name the competitors by name and street. Do not list categories. Be honest about what they do well, then say where they fall short.`,

  "execution-marketing-sales": `Length: 400 to 600 words. Four to six paragraphs covering both the menu/pricing story and the marketing approach.
Structure: Paragraphs 1-2 -- the menu lineup and pricing rationale (name beans, equipment, sourcing partners; explain pricing relative to the local market). Paragraph 3 -- pre-opening marketing strategy. Paragraph 4 -- opening event and its purpose. Paragraphs 5-6 -- ongoing post-opening approach: what the owner does to earn customers and what they deliberately do not do.
This section merges Menu & Pricing with Marketing -- treat them as one go-to-market story. Avoid "high-quality ingredients" and "robust social media presence" -- name the actual products and the actual tactics.`,

  "execution-operations": `Length: 400 to 600 words. Four to six paragraphs covering both location/real estate and equipment.
Structure: Paragraph 1 -- chosen location: address, neighborhood context, why this site. Paragraph 2 -- lease terms (sq ft, monthly rent, per-sq-ft rate, term length, renewal options, abatements). Paragraph 3 -- physical condition of the space and what the build-out entails. Paragraph 4 -- espresso program equipment (name specific machines). Paragraph 5 -- kitchen equipment and production capacity. Paragraph 6 -- service contracts and maintenance reserve.
This section merges Location & Real Estate with Equipment & Supplies. State the actual rent, sq ft, and equipment cost numbers. Explain the reasoning behind major choices, not just what was purchased.
When referencing lease terms: spell out CAM as "common area maintenance (CAM)", NNN as "triple net (NNN)", and TI allowance as "tenant improvement allowance (TI allowance)" on first use. Never assume the owner knows the abbreviation.`,

  "execution-milestones-metrics": `Length: 300 to 450 words. Three to four paragraphs.
Structure: Paragraph 1 -- overview of the timeline and how many milestones, with the date range. Paragraph 2 -- construction and procurement phase (what has long lead times, what must happen first). Paragraph 3 -- training phase (who trains when, what the readiness bar is). Paragraph 4 -- soft open, public opening, and the operational metrics tracked from day one (transactions per day target, average ticket, opening waste percentage, staff retention through month three).
The timeline should feel like someone who has actually thought through what Tuesday morning looks like. Name the equipment with long lead times. Name the metrics the owner will watch weekly.`,

  "company-overview": `Length: 300 to 450 words. Four to five paragraphs.
Structure: Paragraph 1 -- legal entity, address, physical footprint (sq ft, seats, bar configuration). Paragraph 2 -- the concept origin story (honest account of why the owner built this, not a marketing pitch). Paragraphs 3 and 4 -- what the concept looks like in practice: what the customer does when they walk in, what they order, what the room feels like. Paragraph 5 -- the owner's ongoing operational role.
Describe the actual physical experience. Avoid "community hub," "third place," "gathering space" -- describe the actual room. Avoid "mission is to create" -- say what the space actually contains.`,

  "company-team": `Length: 300 to 450 words. Three to four paragraphs plus a brief org structure list.
Structure: Paragraph 1 -- the owner: specific experience, specific roles held, specific numbers (revenue managed, staff trained, years in the craft). Paragraph 2 -- gaps and how they are being filled (advisors, mentors, hired expertise -- name them). Paragraph 3 -- org structure. A brief list of roles is appropriate here.
State what the owner has actually done and why it is relevant. Name the advisors. Avoid inflated credentials. No vague bio language like "brings extensive experience." No org chart titles that don't reflect actual roles.`,

  "financial-plan-forecast": `Length: 300 to 450 words. Four to five paragraphs of narrative supporting the forecast charts.
Structure: Paragraph 1 -- key assumptions (transactions per day, average ticket, opening hours, FTE staffing, ramp curve). Paragraph 2 -- revenue trajectory by month for year one and why the curve is shaped the way it is. Paragraph 3 -- expense trajectory by month and any step changes. Paragraph 4 -- multi-year net profit outlook (years one through three minimum).
Tie every assumption to a source: comparable shops, observed traffic counts, owner experience. Avoid round-number assumptions without justification.`,

  "financial-plan-financing": `Length: 250 to 400 words. Three to four paragraphs.
Structure: Paragraph 1 -- total ask and what is already committed. Paragraph 2 -- loan details (lender, amount, structure, status of application). Paragraph 3 -- use of proceeds with specific line items. Paragraph 4 -- why this capital structure was chosen over alternatives.
State the actual numbers. Name the lender. Say whether the application is pending or approved. Explain the reasoning behind the capital structure choice.`,

  "financial-plan-statements": `Length: 400 to 600 words. Five to six paragraphs.
Structure: Paragraph 1 -- startup costs: total number with specific breakdown. Paragraph 2 -- revenue model: transactions per day, average ticket, monthly targets for months one, six, and twelve, and where those numbers came from. Paragraph 3 -- cost structure: COGS, payroll, occupancy, other operating costs as percentages of revenue. Paragraph 4 -- gross profit and gross margin trajectory. Paragraph 5 -- path to profitability and breakeven month. Paragraph 6 -- owner compensation. TIM-2341: do NOT discuss risks here -- risks have their own section.
This section is the narrative summary of the projected P&L, cash flow, and balance sheet. Do not reproduce the full statement tables here (those live in the appendix). Tell the financial story in plain language.`,

  // TIM-2341: lender-ready default sections. Each polishes the auto-assembled
  // table with a short narrative the lender expects to read alongside it.
  "opportunity-risks": `Length: 350 to 500 words. One short intro paragraph, then a categorized risk register across four lender-standard categories.
Structure: Paragraph 1 -- one or two sentences framing the owner's posture on risk and the standing coverages they carry. Then four categorized risk groupings, each as a bold sub-heading followed by two to four bulleted risks. Every bullet pairs the risk description with the SPECIFIC mitigation already in the plan: the dollar reserve, the insurance policy, the contractual term, the training cadence, the contingency plan.
Categories (use these exact bold headings, in this exact order):
- **Operational risks**: opening delays, staffing gaps, supply disruption, equipment failure.
- **Market risks**: ramp slower than projected, competitor pricing moves, neighborhood foot-traffic changes, seasonality.
- **Financial risks**: cost inflation outpacing price increases, debt-service squeeze if DSCR tightens, cash buffer exhaustion.
- **Regulatory risks**: health code, licensing timelines, lease assignment, employment law.
Cite the SPECIFIC mitigation from the plan -- the working-capital reserve, free rent months, personal guarantee posture, insurance coverages. Avoid generic "we will monitor closely" language.`,

  "financial-plan-unit-economics": `Length: 250 to 400 words. Two or three paragraphs that frame the auto-assembled buildup table.
Structure: Paragraph 1 -- the daily-monthly-annual buildup walked through in plain language (avg ticket × customers/day → daily revenue, daily × open days × 4.33 weeks → monthly). Use the EXACT numbers from the Ground Truth block. Paragraph 2 -- if a daypart breakdown is present, narrate the morning-rush concentration and what that means for staffing and equipment throughput. Paragraph 3 -- if a product mix is present, narrate the espresso/food/retail mix and the weighted blended COGS that mix produces.
Lender wants the unit math, not a story about the brand. Numbers and reasoning, no voice flourish.`,

  "financial-plan-break-even": `Length: 200 to 350 words. Two or three paragraphs after the auto-assembled break-even table.
Structure: Paragraph 1 -- state the monthly revenue and customers/day required to break even at steady state, using the EXACT numbers from the Ground Truth block. Compare against the steady-state projection ("the projection lands X above the break-even line"). Paragraph 2 -- name the two or three operational levers that close the gap fastest if the projection misses (ticket lift via menu engineering, daypart staffing trims, cost-of-goods reduction). Paragraph 3 (optional) -- cite the first profitable month in the projection.
Avoid theoretical break-even discussion. State the actual numbers from THIS plan.`,

  "financial-plan-sensitivity": `Length: 250 to 400 words. Two short paragraphs framing the auto-assembled scenario table.
Structure: Paragraph 1 -- state baseline Y1 net income and frame the table as a lender stress test of the most-likely failure modes. Paragraph 2 -- single out the two scenarios where Y1 net income swings most against baseline, name the SPECIFIC reserve or contingency that addresses each one, and call out which scenarios the projection still survives.
DO NOT re-state every row of the table -- the table is rendered above. Narrate WHICH scenarios most stress the plan and the founder's specific mitigations.`,

  "financial-plan-dscr": `Length: 200 to 350 words. Two or three paragraphs after the auto-assembled DSCR table.
Structure: Paragraph 1 -- state the year-by-year DSCR in plain language ("Year 1 DSCR of X.XX×, rising to Y.YY× by Year 3"), framed against the 1.20× commercial / SBA threshold. Paragraph 2 -- if any year falls below 1.20×, name the specific contributing factor (ramp, cost inflation, debt structure) and the mitigation. If every year clears, say so. Paragraph 3 (if relevant) -- the owner's personal guarantee posture and collateral being offered, since those modify lender DSCR consideration.
If the capital stack has no term debt, write one short paragraph explaining DSCR doesn't apply and how equity coverage is the relevant metric instead. Do not invent debt that isn't in the plan.`,

  "financial-plan-capex-schedule": `Length: 200 to 350 words. One or two paragraphs framing the auto-assembled line-item CapEx table.
Structure: Paragraph 1 -- total CapEx, the three or four most expensive line items, and the rationale for the major equipment choices. Paragraph 2 -- timing of CapEx purchases and how the funding stack covers them (loan draws, founder equity, supplier financing, leasing).
Do not reproduce the full line-item table -- it is rendered above. Narrate the major decisions and why.`,

  "financial-plan-depreciation": `Length: 150 to 300 words. One or two short paragraphs after the auto-assembled depreciation table.
Structure: Paragraph 1 -- state the total annual depreciation in dollars, the method (straight-line), and a sentence each on the two or three useful-life buckets driving most of it (build-out at 15 years, equipment at 7 years, technology at 3 years are typical). Paragraph 2 -- note that depreciation is a non-cash expense and therefore added back to EBITDA on the cash flow statement.
Keep it short and factual. Lenders expect to see it; they don't need narrative around it.`,

  "financial-plan-working-capital": `Length: 200 to 350 words. Two paragraphs after the auto-assembled working capital table.
Structure: Paragraph 1 -- state the inventory, A/P, and A/R days the plan assumes and what each translates into in dollar terms at the Year 1 run rate, using the EXACT numbers from the Ground Truth block. Paragraph 2 -- net working capital tied up in operations and how the opening working-capital reserve in the uses-of-funds line covers it.
Lender wants to see the days × daily-flow math and the cash buffer. Avoid theoretical discussion of working capital management.`,
};

export const BP_MAX_TOKENS_BY_SECTION: Record<string, number> = {
  "executive-summary": 900,
  "opportunity-problem-solution": 1000,
  "opportunity-target-market": 1400,
  "opportunity-competition": 1200,
  // TIM-2341
  "opportunity-risks": 1400,
  "execution-marketing-sales": 1600,
  "execution-operations": 1600,
  "execution-milestones-metrics": 1200,
  "company-overview": 1400,
  "company-team": 1200,
  "financial-plan-forecast": 1200,
  // TIM-2341
  "financial-plan-unit-economics": 1200,
  "financial-plan-break-even": 1000,
  "financial-plan-sensitivity": 1200,
  "financial-plan-financing": 1000,
  "financial-plan-dscr": 1000,
  "financial-plan-capex-schedule": 1000,
  "financial-plan-depreciation": 800,
  "financial-plan-working-capital": 1000,
  "financial-plan-statements": 1600,
};

export interface BpPromptInputs {
  sectionKey: string;
  sectionTitle: string;
  sectionAutoContent: string;
  shopName: string;
  planSnapshot: string;
  founderBudget: string;
  founderLocation: string;
  founderStage: string;
  // TIM-2334: optional plan_state ground-truth payload. When provided, the
  // narrative is forbidden from inventing numbers — every quantitative claim
  // must match this block so narrative + financial tables agree. Plain string
  // (already serialized by formatPlanStateForPrompt) to keep this module
  // free of @/ imports so the node:test runner can load it directly.
  planStateGroundTruth?: string;
  // TIM-2342: source-marker directive + industry-benchmark block. Pre-rendered
  // strings the caller assembles (SOURCE_MARKER_DIRECTIVE and
  // formatBenchmarksForPrompt(sectionKey)). When provided, the narrative LLM
  // wraps every numeric claim in <num src="…">…</num> markers and is allowed
  // to cite <num src="benchmark">…</num> only against the listed benchmarks.
  sourceMarkerDirective?: string;
  industryBenchmarks?: string;
}

export interface BpPromptOutput {
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
}

// TIM-2334: shared ground-truth directive injected when planStateGroundTruth is
// provided. The narrative LLM must quote the numbers from the block verbatim
// so narrative + financial tables can no longer describe two different
// businesses (cf. investor critique on TIM-2315, Beaver & Beef regenerated plan).
export const BP_PLAN_STATE_DIRECTIVE = `Quantitative ground-truth rule:
- The "Ground Truth Numbers" block below holds the EXACT figures the financial tables will show.
- Use those numbers verbatim. Do not round to different round numbers. Do not invent additional dollar figures, headcounts, percentages, capital totals, rent amounts, or year-by-year figures that are not in the block.
- If the section calls for a number that is not in the block, prefer words ("the team", "a modest payroll") to a fabricated figure.
- Every dollar figure or count you cite must round-trip cleanly against the block — narrative and tables must agree.`;

export function buildBpSectionPrompt(inp: BpPromptInputs): BpPromptOutput {
  const sectionSpec = BP_SECTION_SPECS[inp.sectionKey] ?? "";
  const maxTokens = BP_MAX_TOKENS_BY_SECTION[inp.sectionKey] ?? 1200;

  const groundTruthBlock = inp.planStateGroundTruth?.trim()
    ? `\n${BP_PLAN_STATE_DIRECTIVE}\n\n${inp.planStateGroundTruth.trim()}\n`
    : "";

  // TIM-2342: source-marker directive in the SYSTEM prompt so it ranks
  // alongside the voice rules. The industry-benchmarks block goes in the
  // USER message next to the ground-truth block so the model sees both
  // approved sources together when reaching for a number.
  const sourceMarkerBlock = inp.sourceMarkerDirective?.trim()
    ? `\n\n${inp.sourceMarkerDirective.trim()}`
    : "";
  const benchmarksBlock = inp.industryBenchmarks?.trim()
    ? `\n${inp.industryBenchmarks.trim()}\n`
    : "";

  if (inp.sectionKey === "executive-summary") {
    const systemPrompt = `You are an expert coffee shop business advisor writing an executive summary for a founder's business plan.

${BP_SHARED_RULES}${sourceMarkerBlock}

Section spec:
${sectionSpec}`;

    const userMessage = `Write the executive summary for ${inp.shopName}.

Founder context:
- Budget: ${inp.founderBudget}
- Location: ${inp.founderLocation}
- Stage: ${inp.founderStage}
${groundTruthBlock}${benchmarksBlock}
Plan data:
${inp.planSnapshot || "The workspaces are mostly empty, so generate from the founder context above plus reasonable, clearly-grounded assumptions for a coffee shop at this stage and location. Write a complete four-paragraph executive summary now -- do not refuse or list what is missing."}`;

    return { systemPrompt, userMessage, maxTokens };
  }

  const systemPrompt = `You are an expert coffee shop business advisor writing the "${inp.sectionTitle}" section of a founder's business plan.

${BP_SHARED_RULES}${sourceMarkerBlock}

Section spec:
${sectionSpec}`;

  const userMessage = `Write the "${inp.sectionTitle}" section for ${inp.shopName}.

Founder context:
- Budget: ${inp.founderBudget}
- Location: ${inp.founderLocation}
- Stage: ${inp.founderStage}
${groundTruthBlock}${benchmarksBlock}
Assembled plan data for this section:
${inp.sectionAutoContent || "(No section-specific data entered for this section yet.)"}

Wider plan context (use this to ground the section even when the section-specific data above is thin):
${inp.planSnapshot || "(Other workspaces are not filled in yet -- lean on the founder context and reasonable coffee-business assumptions.)"}

Write a complete, usable draft of this section now. Generate from whatever context is available above plus your coffee-business expertise, making and grounding reasonable assumptions. Do not refuse and do not tell the founder there is not enough context.`;

  return { systemPrompt, userMessage, maxTokens };
}

// Section keys eligible for regenerate-all are exactly the keys with a section
// spec above (i.e. AI-generated sections, not a pure data appendix). Kept as
// a pure list here so this module has no transitive @/ imports and stays
// loadable from the node:test runner.
export const BP_REGENERABLE_SECTION_KEYS: string[] = Object.keys(BP_SECTION_SPECS);
