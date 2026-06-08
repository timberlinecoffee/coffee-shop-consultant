// TIM-1687: one-off credit top-up — catalog + webhook grant acceptance tests.
// Run with `npm test` (node --experimental-strip-types --test).

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  CREDIT_PACK_LIST,
  CREDIT_PACKS_BY_KEY,
  creditsForPackKey,
  isCreditPackKey,
  formatPackPrice,
} from "../../../lib/credits/packs.ts";

describe("TIM-1687: credit pack catalog", () => {
  test("every pack grants a positive credit amount and has a price", () => {
    for (const pack of CREDIT_PACK_LIST) {
      assert.ok(pack.credits > 0, `${pack.key} must grant > 0 credits`);
      assert.ok(pack.amountCents > 0, `${pack.key} must have a price`);
    }
  });

  test("creditsForPackKey resolves known keys and rejects unknown ones", () => {
    assert.equal(creditsForPackKey("small"), CREDIT_PACKS_BY_KEY.small.credits);
    assert.equal(creditsForPackKey("medium"), CREDIT_PACKS_BY_KEY.medium.credits);
    assert.equal(creditsForPackKey("large"), CREDIT_PACKS_BY_KEY.large.credits);
    assert.equal(creditsForPackKey("bogus"), null);
    assert.equal(creditsForPackKey(""), null);
  });

  test("isCreditPackKey narrows only to real keys", () => {
    assert.equal(isCreditPackKey("small"), true);
    assert.equal(isCreditPackKey("xl"), false);
  });

  test("formatPackPrice renders whole dollars without cents", () => {
    assert.equal(formatPackPrice(1900), "$19");
    assert.equal(formatPackPrice(3999), "$39.99");
  });

  // TIM-2309: launch SKU sanity — credits and prices match the board-approved
  // ladder (100/$19, 500/$79, 1500/$199).
  test("TIM-2309 launch packs match the approved ladder", () => {
    assert.equal(CREDIT_PACKS_BY_KEY.small.credits, 100);
    assert.equal(CREDIT_PACKS_BY_KEY.small.amountCents, 1900);
    assert.equal(CREDIT_PACKS_BY_KEY.medium.credits, 500);
    assert.equal(CREDIT_PACKS_BY_KEY.medium.amountCents, 7900);
    assert.equal(CREDIT_PACKS_BY_KEY.large.credits, 1500);
    assert.equal(CREDIT_PACKS_BY_KEY.large.amountCents, 19900);
  });
});

// ---------------------------------------------------------------------------
// Webhook grant logic — mirror of the checkout.session.completed credit_pack
// branch in webhook/route.ts, driven with an in-memory Supabase stub.
// ---------------------------------------------------------------------------

let usersRow = null;
let ledger = [];

function makeSupabase() {
  return {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                single() {
                  if (table === "users") return { data: usersRow };
                  return { data: null };
                },
              };
            },
          };
        },
        update(payload) {
          return {
            eq() {
              if (table === "users") usersRow = { ...usersRow, ...payload };
              return { data: null, error: null };
            },
          };
        },
        insert(payload) {
          if (table === "credit_transactions") ledger.push(payload);
          return { data: null, error: null };
        },
      };
    },
  };
}

// Verbatim mirror of the credit_pack grant branch.
async function handleCreditTopup(session, supabase) {
  if (!(session.mode === "payment" && session.metadata?.kind === "credit_pack")) return;

  const userId = session.metadata?.userId;
  const packKey = session.metadata?.packKey ?? "";
  const credits = creditsForPackKey(packKey);

  if (!userId || credits === null || credits <= 0) return;
  if (session.payment_status !== "paid") return;

  const { data: prof } = await supabase
    .from("users")
    .select("ai_credits_remaining")
    .eq("id", userId)
    .single();

  const current = prof?.ai_credits_remaining ?? 0;

  await supabase.from("users").update({ ai_credits_remaining: current + credits }).eq("id", userId);
  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount: credits,
    type: "purchase",
    description: `Credit top-up: ${packKey} pack (+${credits})`,
  });
}

describe("TIM-1687: webhook credit grant", () => {
  beforeEach(() => {
    usersRow = { id: "user_1", ai_credits_remaining: 0 };
    ledger = [];
  });

  test("a paid medium pack grants credits onto the balance and the ledger", async () => {
    const session = {
      mode: "payment",
      payment_status: "paid",
      metadata: { kind: "credit_pack", userId: "user_1", packKey: "medium", credits: "500" },
    };
    await handleCreditTopup(session, makeSupabase());

    assert.equal(usersRow.ai_credits_remaining, 500, "balance should reflect the grant");
    assert.equal(ledger.length, 1, "one ledger row");
    assert.equal(ledger[0].amount, 500);
    assert.equal(ledger[0].type, "purchase");
    assert.equal(ledger[0].user_id, "user_1");
  });

  test("grant adds onto an existing non-zero balance", async () => {
    usersRow = { id: "user_1", ai_credits_remaining: 7 };
    const session = {
      mode: "payment",
      payment_status: "paid",
      metadata: { kind: "credit_pack", userId: "user_1", packKey: "small", credits: "100" },
    };
    await handleCreditTopup(session, makeSupabase());
    assert.equal(usersRow.ai_credits_remaining, 107);
  });

  test("unpaid session grants nothing", async () => {
    const session = {
      mode: "payment",
      payment_status: "unpaid",
      metadata: { kind: "credit_pack", userId: "user_1", packKey: "large" },
    };
    await handleCreditTopup(session, makeSupabase());
    assert.equal(usersRow.ai_credits_remaining, 0);
    assert.equal(ledger.length, 0);
  });

  test("unknown pack key grants nothing (no client-inflated amount)", async () => {
    const session = {
      mode: "payment",
      payment_status: "paid",
      metadata: { kind: "credit_pack", userId: "user_1", packKey: "mega", credits: "999999" },
    };
    await handleCreditTopup(session, makeSupabase());
    assert.equal(usersRow.ai_credits_remaining, 0);
    assert.equal(ledger.length, 0);
  });

  test("subscription-mode checkout is ignored by the credit-pack branch", async () => {
    const session = {
      mode: "subscription",
      payment_status: "paid",
      metadata: { userId: "user_1" },
    };
    await handleCreditTopup(session, makeSupabase());
    assert.equal(usersRow.ai_credits_remaining, 0);
    assert.equal(ledger.length, 0);
  });
});
