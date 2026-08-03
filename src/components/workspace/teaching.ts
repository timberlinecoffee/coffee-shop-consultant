// TIM-4112 (UX Phase 4): the teaching layer.
//
// Trent's requirement, in his words: the owner should have "the opportunity to
// learn as they are building this out". Phase 3 made every screen tell them
// WHERE they are. This tells them WHY the thing in front of them matters.
//
// ── The rule these lines follow ──────────────────────────────────────────
//
// A teaching line explains why this step matters TO A COFFEE SHOP. It never
// explains what a control does. "Enter your average ticket" is instructions;
// "one drink, or a drink and a pastry — the difference is your whole margin"
// is the thing an owner did not know.
//
// That distinction is guarded, not just described: teaching.test.mjs fails on
// UI vocabulary (click, button, field, tab, enter, select, form). If a line
// needs those words, it is documentation and belongs somewhere else.
//
// Three more rules, from the session-zero brief and the beginner walkthrough:
//
//   • The reader has never opened a business and does not know COGS or a P&L.
//     Not stupid — new. Where a trade term is unavoidable, the plain words come
//     first and the term second, so they learn it without being tested on it.
//   • Never ask for a number they cannot produce. Where a real range exists,
//     give it. "Most espresso bars land between $6 and $10 a visit" turns a
//     blank box into a starting point.
//   • Say the consequence, not the instruction. The walkthrough's finding was
//     that the product tells people what to do and never why, so nothing they
//     learn transfers to the decisions it cannot make for them.
//
// The T1-B ramp explanation was the prototype for all of this: it explains that
// the two revenue figures differ because of a deliberate assumption the owner
// can change — not because the arithmetic is odd.
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

/** Keyed by the workspace's own key, then by step id where the screen has steps. */
type TeachingContent = {
  /** Shown when no step is current — list-shaped screens, or a finished one. */
  workspace: string;
  /** Shown while that step is the next thing to do. */
  steps?: Record<string, string>;
};

const TEACHING: Record<string, TeachingContent> = {
  concept: {
    workspace:
      "Every other part of the plan reads back to this one. Be specific — “a coffee shop” cannot guide a single decision, but “the place people go to work on Tuesday mornings” already decides your seating, your Wi-Fi and your hours.",
  },

  marketing: {
    workspace:
      "Marketing for a new shop is mostly not advertising. It is deciding who walks past, what you want them to remember, and being ready on the day you open.",
    steps: {
      overview:
        "Most new shops get their first hundred customers from people who already walk past the door. Knowing who those people are, before you spend anything, is what stops you paying to reach strangers.",
      channels:
        "Pick two or three you will actually keep up with. A quiet Instagram and a dead mailing list read worse to a customer than never having started either.",
      story:
        "People choose a coffee shop for a reason they can say out loud to a friend. If you cannot say yours in one sentence, they cannot repeat it for you.",
      pre_launch:
        "Opening day is the one day you are guaranteed an audience. Shops that fill it planned it weeks earlier; the ones that did not spend their first month explaining that they exist.",
    },
  },

  financials: {
    workspace:
      "These numbers are the ones a landlord or a bank will ask about, and the ones that tell you whether the shop works before you have spent anything proving it.",
    steps: {
      "v2-section-daily-traffic":
        "Everything else here multiplies out from this one number. A new neighbourhood cafe often sees 80–150 customers a day — guess low, and you find out now rather than after you have signed a lease.",
      "v2-section-revenue":
        "One drink, or a drink and a pastry — that difference is most of your margin. Most espresso bars land between $6 and $10 a visit.",
      "v2-section-costs":
        "Rent, insurance and the coffee itself do not care how quiet Tuesday was. These are the costs that decide how many customers a day you need just to keep the doors open.",
      "v2-section-staffing":
        "Wages are usually the biggest cost after rent, and the one most often guessed at. Two people on a slow Tuesday costs the same whether ten customers come in or a hundred.",
      "v2-section-startup":
        "This is the money you spend before a single cup is sold — fit-out, equipment, the first inventory, the deposit. It is the number people underestimate most, and the one your funding has to cover.",
      "v2-section-funding":
        "Savings, a loan, an investor, or some of each. Naming where the money comes from is what turns a startup cost into a plan rather than a hope.",
      "v2-section-growth":
        "Almost nobody is busy in month one. Planning the climb honestly is what tells you how much cash you need to survive it — which is the number that closes most new shops.",
    },
  },

  location_lease: {
    workspace:
      "Rent is the one cost you cannot renegotiate after you sign. Comparing a few sites side by side, even when you are fairly sure, is what shows you what you are actually paying for.",
  },

  buildout_equipment: {
    workspace:
      "The espresso machine gets all the attention, but it is usually the fridges, the sinks and the fit-out that break the budget. Listing everything is how you find that out before a contractor does.",
  },

  suppliers: {
    workspace:
      "Two quotes for each thing is the whole exercise. Suppliers expect it, and the second quote is usually what tells you whether the first one was fair.",
  },

  menu_pricing: {
    workspace:
      "Price from what a drink costs you to make, not from what the shop down the road charges. Their rent is not your rent, and their milk order is not your milk order.",
  },

  hiring: {
    workspace:
      "You will hire before you feel ready — everyone does. Writing down what each person is actually for is what stops you hiring a friend into a job that does not exist yet.",
  },

  operations_playbook: {
    workspace:
      "The point is not the binder. It is that on the morning you are ill, someone else can open the shop without phoning you.",
  },

  opening_month_plan: {
    workspace:
      "The weeks before opening go faster than anyone expects. Putting dates on things is what turns “we should sort the permits” into something that actually happens.",
  },

  business_plan: {
    workspace:
      "This is the document a bank or a landlord reads. It is assembled from everything else you have written, so your job here is to make it sound like you rather than like software.",
  },
};

/**
 * The line to show right now.
 *
 * `stepId` is whatever the emphasised button is pointing at. When a screen has
 * no current step — a list you add to, or a workspace the owner has finished —
 * it falls back to the workspace's own line, so the space is never empty and
 * never repeats an instruction the owner has already followed.
 */
export function teachingLine(
  workspaceKey: string,
  stepId?: string | null,
): string | undefined {
  const content = TEACHING[workspaceKey];
  if (!content) return undefined;
  if (stepId && content.steps?.[stepId]) return content.steps[stepId];
  return content.workspace;
}

/** Every workspace that has any teaching content. Exported for the guards. */
export function teachingKeys(): string[] {
  return Object.keys(TEACHING);
}

/** Every line, flattened. Exported so the guards can check all of them at once. */
export function allTeachingLines(): { where: string; line: string }[] {
  const out: { where: string; line: string }[] = [];
  for (const [key, content] of Object.entries(TEACHING)) {
    out.push({ where: key, line: content.workspace });
    for (const [step, line] of Object.entries(content.steps ?? {})) {
      out.push({ where: `${key}/${step}`, line });
    }
  }
  return out;
}
