// TIM-1418: loadPlanContext tests — verifies live-table values win over the
// frozen onboarding snapshot, and that the helper degrades cleanly when a
// founder has no plan yet.

import { test } from "node:test";
import assert from "node:assert/strict";

import { EMPTY_PLAN_CONTEXT, loadPlanContext } from "./plan-context.ts";

function fakeSupabase(routes) {
  return {
    from(table) {
      const route = routes[table];
      if (!route) {
        throw new Error(`fakeSupabase missing route for table '${table}'`);
      }
      return route();
    },
  };
}

function singleResult(row) {
  // Mimics the postgrest builder chain ending in maybeSingle().
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: row ?? null }),
    then: undefined,
  };
  return builder;
}

function listResult(rows) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    order: () => Promise.resolve({ data: rows }),
    limit: () => builder,
    maybeSingle: async () => ({ data: rows[0] ?? null }),
  };
  return builder;
}

const PLAN_ROW = { id: "plan-1", plan_name: "Tide & Timber" };

const CONCEPT_DOC = {
  content: {
    version: 2,
    components: {
      shop_identity: { content: "Tide Identity", included: true },
      vision: { content: "Neighborhood living room", included: true },
      target_customer: { content: "Local commuters", included: true },
      differentiation: { content: "Lending library", included: true },
      brand_voice: { content: "Warm", included: true },
      location: { content: "", included: false },
      offering: { content: "", included: false },
    },
    personas: [
      {
        id: "p1",
        name: "Morning Commuter",
        isPrimary: true,
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z",
        whyTheyVisit: "Catches the train at 7:40",
      },
    ],
  },
};

const MARKETING_DOC_LIVE = {
  content: {
    overview: { narrative: "" },
    channels: { selected: [] },
    story: {
      founder_story: "",
      origin: "",
      differentiator: "Warm, Direct, Neighbourhood",
      target_customer: "",
    },
    pre_launch: { milestones: [] },
    last_generated_at: null,
  },
};

const MARKETING_DOC_EMPTY = {
  content: {
    overview: { narrative: "" },
    channels: { selected: [] },
    story: {
      founder_story: "",
      origin: "",
      differentiator: "",
      target_customer: "",
    },
    pre_launch: { milestones: [] },
    last_generated_at: null,
  },
};

const ONBOARDING_PILLARS = {
  onboarding_data: { brand_pillars: ["Quiet", "Daily Ritual"] },
};

test("returns EMPTY_PLAN_CONTEXT when the user has no plan", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(null),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.deepEqual(ctx, EMPTY_PLAN_CONTEXT);
});

test("prefers coffee_shop_plans.plan_name for shop_name (TIM-1406 SoT)", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(PLAN_ROW),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_EMPTY,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () => listResult([]),
    plan_hiring_settings: () => singleResult(null),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.equal(ctx.shop_name, "Tide & Timber");
});

test("falls back to concept.shop_identity when plan_name is blank", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult({ id: "plan-1", plan_name: "" }),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_EMPTY,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () => listResult([]),
    plan_hiring_settings: () => singleResult(null),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.equal(ctx.shop_name, "Tide Identity");
});

test("vision / differentiation come from concept components", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(PLAN_ROW),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_EMPTY,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () => listResult([]),
    plan_hiring_settings: () => singleResult(null),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.equal(ctx.vision, "Neighborhood living room");
  assert.equal(ctx.differentiation, "Lending library");
});

test("target_customer uses the primary persona name + whyTheyVisit", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(PLAN_ROW),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_EMPTY,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () => listResult([]),
    plan_hiring_settings: () => singleResult(null),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.equal(ctx.target_customer, "Morning Commuter — Catches the train at 7:40");
});

test("brand_pillars: marketing.story.differentiator wins over onboarding", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(PLAN_ROW),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_LIVE,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () => listResult([]),
    plan_hiring_settings: () => singleResult(null),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.deepEqual(ctx.brand_pillars, ["Warm", "Direct", "Neighbourhood"]);
});

test("brand_pillars: falls back to onboarding when marketing differentiator is blank", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(PLAN_ROW),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_EMPTY,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () => listResult([]),
    plan_hiring_settings: () => singleResult(null),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.deepEqual(ctx.brand_pillars, ["Quiet", "Daily Ritual"]);
});

test("location_country: plan_hiring_settings override wins", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(PLAN_ROW),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_EMPTY,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () =>
      listResult([
        { country: "CA", status: "signed", archived: false, position: 0 },
      ]),
    plan_hiring_settings: () => singleResult({ hiring_country: "US" }),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.equal(ctx.location_country, "US");
});

test("location_country: falls back to signed location_candidate when no override", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(PLAN_ROW),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_EMPTY,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () =>
      listResult([
        { country: "GB", status: "scouting", archived: false, position: 0 },
        { country: "CA", status: "signed", archived: false, position: 1 },
      ]),
    plan_hiring_settings: () => singleResult({ hiring_country: null }),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.equal(ctx.location_country, "CA");
});

test("location_country: first non-archived candidate when nothing signed", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(PLAN_ROW),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_EMPTY,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () =>
      listResult([
        { country: "US", status: "scouting", archived: true, position: 0 },
        { country: "AU", status: "scouting", archived: false, position: 1 },
      ]),
    plan_hiring_settings: () => singleResult(null),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.equal(ctx.location_country, "AU");
});

test("location_country: null when no candidates and no override", async () => {
  const supabase = fakeSupabase({
    coffee_shop_plans: () => singleResult(PLAN_ROW),
    workspace_documents: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col, key) => ({
            maybeSingle: async () => ({
              data: key === "concept" ? CONCEPT_DOC : MARKETING_DOC_EMPTY,
            }),
          }),
        }),
      }),
    }),
    location_candidates: () => listResult([]),
    plan_hiring_settings: () => singleResult(null),
    users: () => singleResult(ONBOARDING_PILLARS),
  });
  const ctx = await loadPlanContext(supabase, "user-1");
  assert.equal(ctx.location_country, null);
});
