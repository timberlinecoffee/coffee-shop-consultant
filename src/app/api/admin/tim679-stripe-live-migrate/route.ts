// TIM-679: one-shot admin route that creates the live-mode Stripe products +
// prices needed for prod checkout. Bootstraps the migration under SA-Stripe
// authorization ([TIM-2894](/TIM/issues/TIM-2894#document-policy-sa-stripe))
// because the VPS execution env has no sk_live_ (Sensitive-flagged in Vercel,
// non-extractable) and prod runtime is the only place that can call Stripe
// with the live key.
//
// Auth: service-role bearer. The invoker (CTO agent) is the only actor with
// the plaintext SUPABASE_SERVICE_ROLE_KEY on VPS, and that key already grants
// full Supabase admin. This route does not add new attack surface — it just
// re-uses that trust boundary.
//
// Idempotent: lists live products, matches Groundwork Starter / Pro by name +
// metadata.tier, verifies 4 active prices with expected amounts + intervals.
// If found, returns existing IDs unchanged. If missing, creates.
//
// After this ships and the migration runs, follow-up PR should either remove
// this route or convert it to a check-only endpoint. Leaving a "create Stripe
// products" endpoint permanent is a footgun.

import { NextRequest } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    dryRun: z.boolean().optional().default(false),
  })
  .strict();

type PlanTarget = {
  tier: "starter" | "pro";
  productName: string;
  description: string;
  monthlyAmount: number;
  annualAmount: number;
  monthlyEnvKey: string;
  annualEnvKey: string;
};

const PLAN_TARGETS: PlanTarget[] = [
  {
    tier: "starter",
    productName: "Groundwork Starter",
    description:
      "Groundwork Starter — coffee-shop planning workspace with core curriculum and monthly AI coaching credits.",
    monthlyAmount: 3900,
    annualAmount: 37500,
    monthlyEnvKey: "STRIPE_STARTER_MONTHLY_PRICE_ID",
    annualEnvKey: "STRIPE_STARTER_ANNUAL_PRICE_ID",
  },
  {
    tier: "pro",
    productName: "Groundwork Pro",
    description:
      "Groundwork Pro — full concept-to-open workflow, advanced financial modelling, and expanded monthly AI coaching credits.",
    monthlyAmount: 9900,
    annualAmount: 95000,
    monthlyEnvKey: "STRIPE_PRO_MONTHLY_PRICE_ID",
    annualEnvKey: "STRIPE_PRO_ANNUAL_PRICE_ID",
  },
];

type PlanResult = {
  tier: "starter" | "pro";
  productId: string;
  productName: string;
  monthlyPriceId: string;
  annualPriceId: string;
  action: "reused" | "created" | "would-create";
};

function ctEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function POST(request: NextRequest) {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svcKey) {
    return Response.json({ error: "Service role not configured" }, { status: 503 });
  }
  const bearer = extractBearer(request);
  if (!bearer || !ctEq(bearer, svcKey)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    bucket: "tim679-live-migrate",
    id: "cto",
    limit: 6,
    windowSec: 300,
  });
  if (rl) return rl;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return Response.json({ error: "Stripe secret not configured" }, { status: 503 });
  }
  const isLiveKey = stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_");

  let parsed: z.infer<typeof BodySchema>;
  try {
    const raw = await request.json();
    parsed = BodySchema.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { dryRun } = parsed;

  const stripe = new Stripe(stripeKey, { apiVersion: "2026-03-25.dahlia" });

  try {
    const plans: PlanResult[] = [];

    for (const target of PLAN_TARGETS) {
      const productList = await stripe.products.search({
        query: `active:'true' AND name:'${target.productName.replace(/'/g, "\\'")}'`,
        limit: 5,
      });
      let product = productList.data.find(
        (p) => p.name === target.productName && (p.metadata?.tier === target.tier || !p.metadata?.tier),
      );

      let productId: string;
      let action: PlanResult["action"] = "reused";

      if (product) {
        productId = product.id;
      } else {
        if (dryRun) {
          plans.push({
            tier: target.tier,
            productId: "<would-create>",
            productName: target.productName,
            monthlyPriceId: "<would-create>",
            annualPriceId: "<would-create>",
            action: "would-create",
          });
          continue;
        }
        const created = await stripe.products.create({
          name: target.productName,
          description: target.description,
          metadata: { tier: target.tier, source: "tim679-live-migrate" },
        });
        productId = created.id;
        product = created;
        action = "created";
      }

      const prices = await stripe.prices.list({ product: productId, active: true, limit: 20 });

      const findPrice = (amount: number, interval: "month" | "year") =>
        prices.data.find(
          (p) =>
            p.currency === "usd" &&
            p.unit_amount === amount &&
            p.recurring?.interval === interval &&
            (p.metadata?.tier === target.tier || !p.metadata?.tier),
        );

      let monthlyPrice = findPrice(target.monthlyAmount, "month");
      let annualPrice = findPrice(target.annualAmount, "year");

      if (!monthlyPrice) {
        if (dryRun) {
          plans.push({
            tier: target.tier,
            productId,
            productName: target.productName,
            monthlyPriceId: "<would-create>",
            annualPriceId: annualPrice?.id ?? "<would-create>",
            action: "would-create",
          });
          continue;
        }
        monthlyPrice = await stripe.prices.create({
          product: productId,
          unit_amount: target.monthlyAmount,
          currency: "usd",
          recurring: { interval: "month" },
          metadata: { tier: target.tier, interval: "monthly", source: "tim679-live-migrate" },
        });
        action = action === "created" ? "created" : "created";
      }

      if (!annualPrice) {
        if (dryRun) {
          plans.push({
            tier: target.tier,
            productId,
            productName: target.productName,
            monthlyPriceId: monthlyPrice.id,
            annualPriceId: "<would-create>",
            action: "would-create",
          });
          continue;
        }
        annualPrice = await stripe.prices.create({
          product: productId,
          unit_amount: target.annualAmount,
          currency: "usd",
          recurring: { interval: "year" },
          metadata: { tier: target.tier, interval: "annual", source: "tim679-live-migrate" },
        });
        action = "created";
      }

      plans.push({
        tier: target.tier,
        productId,
        productName: target.productName,
        monthlyPriceId: monthlyPrice.id,
        annualPriceId: annualPrice.id,
        action,
      });
    }

    const envVarsToSet: Record<string, string> = {};
    for (const p of plans) {
      const target = PLAN_TARGETS.find((t) => t.tier === p.tier)!;
      envVarsToSet[target.monthlyEnvKey] = p.monthlyPriceId;
      envVarsToSet[target.annualEnvKey] = p.annualPriceId;
    }

    return Response.json({
      ok: true,
      dryRun,
      keyMode: isLiveKey ? "live" : "test",
      plans,
      envVarsToSet,
    });
  } catch (err) {
    const stripeErr = err as { message?: string; code?: string; type?: string };
    console.error("TIM-679 migration error:", stripeErr.message ?? String(err));
    return Response.json(
      {
        error: "Migration failed",
        code: stripeErr.code ?? null,
        type: stripeErr.type ?? null,
      },
      { status: 500 },
    );
  }
}
