// TIM-3096: internal endpoint that lets the CSM agent send a personalized,
// founder-voice email to a single customer without a board click.
//
// Auth: bearer token (`INTERNAL_AGENT_TOKEN`) — the same shape as the cron
// routes' CRON_SECRET. The token is server-issued; agents read it from their
// own env and never expose it to a browser. If unset the route 503s so a
// misconfigured deploy fails loud rather than dispatching unsigned mail.
//
// Standing rules applied:
//  Rule 2 — token + allowed-agent allowlist re-checked server-side; the
//           `agentId` in the body is audit metadata, NOT the access decision.
//  Rule 3 — zod-validated body; email shape and length caps before any I/O.
//  Rule 4 — enforceRateLimit() per-token (5/min, 30/hr) AND per-recipient
//           (3/day) so a runaway loop can't pile sends on one customer or
//           blow the Resend cost cap.
//  Rule 5 — try/catch at the boundary; sanitized `{ error: string }` body,
//           never the upstream Resend payload or stack.
//
// Audit: every dispatch logs a single structured line to stdout with
// agentId + sha256(to)[0..16] + subject (truncated) + Resend message id. We
// do NOT log the full body — message content is PII.

import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendFounderEmail } from "@/lib/email/send-founder-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allowlisted agent ids that may call this route. CSM is the only caller in
// the Day 0 onboarding playbook (TIM-509); we keep an explicit list so a
// leaked token can't silently widen the blast radius.
const ALLOWED_AGENT_IDS = new Set<string>([
  "66a0600c-439f-41c3-bb51-8651eefa5aa2", // CSM
]);

const FounderEmailBody = z.object({
  to: z.string().email().max(320),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(8000),
  html: z.string().max(20000).optional(),
  agentId: z.string().uuid(),
});

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_AGENT_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${expected}`;
}

function hashRecipient(to: string): string {
  return createHash("sha256").update(to.toLowerCase()).digest("hex").slice(0, 16);
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    if (!process.env.INTERNAL_AGENT_TOKEN) {
      return json(
        { error: "service_unavailable" },
        { status: 503 },
      );
    }

    if (!authorized(request)) {
      return json({ error: "unauthorized" }, { status: 401 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = FounderEmailBody.safeParse(raw);
    if (!parsed.success) {
      return json(
        { error: "invalid_body", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (!ALLOWED_AGENT_IDS.has(body.agentId)) {
      return json({ error: "agent_not_authorized" }, { status: 403 });
    }

    const perAgentMin = await enforceRateLimit({
      bucket: "founder-email:agent:1m",
      id: body.agentId,
      limit: 5,
      windowSec: 60,
    });
    if (perAgentMin) return perAgentMin;

    const perAgentHour = await enforceRateLimit({
      bucket: "founder-email:agent:1h",
      id: body.agentId,
      limit: 30,
      windowSec: 3600,
    });
    if (perAgentHour) return perAgentHour;

    const recipientKey = hashRecipient(body.to);
    const perRecipientDay = await enforceRateLimit({
      bucket: "founder-email:to:1d",
      id: recipientKey,
      limit: 3,
      windowSec: 86_400,
    });
    if (perRecipientDay) return perRecipientDay;

    const result = await sendFounderEmail({
      to: body.to,
      subject: body.subject,
      text: body.text,
      html: body.html,
    });

    const auditLine = {
      event: "founder_email_dispatch",
      agentId: body.agentId,
      toHash: recipientKey,
      subject: body.subject.slice(0, 80),
      ok: result.ok,
      providerId: result.ok ? result.id : null,
      skipped: !result.ok && "skipped" in result ? result.skipped : false,
      status: !result.ok && "status" in result ? result.status : null,
    };
    console.log(JSON.stringify(auditLine));

    if (result.ok) {
      return json({ ok: true, providerId: result.id });
    }
    if (result.skipped) {
      // RESEND_API_KEY missing — dev/preview only. Surface explicitly so a
      // misconfigured prod doesn't pretend to send.
      return json(
        { error: "email_provider_not_configured" },
        { status: 503 },
      );
    }
    return json(
      { error: "email_dispatch_failed" },
      { status: 502 },
    );
  } catch (err) {
    const requestId = request.headers.get("x-vercel-id") ?? "n/a";
    console.error(
      JSON.stringify({
        event: "founder_email_route_error",
        requestId,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return json({ error: "internal_error" }, { status: 500 });
  }
}
