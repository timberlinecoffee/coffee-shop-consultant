// qa-fixture-admin — TIM-682
// Server-side guard for QA fixture user mutations.
//
// Accepts:  POST { op: 'create'|'update'|'delete', email: string, password?: string }
// Header:   Authorization: Bearer <QA_FIXTURE_TOKEN>
//
// Allowlist: only ^qa-[a-z0-9._-]+@timberline\.coffee$ may be mutated.
// Every attempt (allowed or refused) is written to auth_users_audit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_EMAIL_RE = /^qa-[a-z0-9._-]+@timberline\.coffee$/;

type Op = "create" | "update" | "delete";

interface RequestBody {
  op: Op;
  email: string;
  password?: string;
}

async function writeAudit(
  serviceClient: ReturnType<typeof createClient>,
  op: Op,
  email: string,
  outcome: "allowed" | "refused",
  refusalCode?: string,
  sourceIp?: string,
) {
  await serviceClient.from("auth_users_audit").insert({
    op,
    target_email: email,
    outcome,
    refusal_code: refusalCode ?? null,
    source_ip: sourceIp ?? null,
  });
}

Deno.serve(async (req: Request) => {
  // --- Auth: shared secret ------------------------------------------------
  const expectedToken = Deno.env.get("QA_FIXTURE_TOKEN");
  if (!expectedToken) {
    return new Response(
      JSON.stringify({ error: "server_misconfigured", detail: "QA_FIXTURE_TOKEN not set" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const callerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!callerToken || callerToken !== expectedToken) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- Parse body ---------------------------------------------------------
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "bad_request", detail: "invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { op, email, password } = body;

  if (!op || !["create", "update", "delete"].includes(op)) {
    return new Response(
      JSON.stringify({ error: "bad_request", detail: "op must be create|update|delete" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!email || typeof email !== "string") {
    return new Response(
      JSON.stringify({ error: "bad_request", detail: "email is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- Service-role client ------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const sourceIp = req.headers.get("x-forwarded-for") ?? undefined;

  // --- Allowlist check ----------------------------------------------------
  if (!ALLOWED_EMAIL_RE.test(email)) {
    await writeAudit(serviceClient, op, email, "refused", "not_allowlisted", sourceIp);
    return new Response(
      JSON.stringify({ error: "not_allowlisted", email }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- Execute operation --------------------------------------------------
  try {
    if (op === "create") {
      if (!password) {
        return new Response(
          JSON.stringify({ error: "bad_request", detail: "password required for create" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const { data, error } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      await writeAudit(serviceClient, op, email, "allowed", undefined, sourceIp);
      return new Response(
        JSON.stringify({ ok: true, userId: data.user?.id }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (op === "update") {
      // Look up user by email first
      const { data: listData, error: listError } = await serviceClient.auth.admin.listUsers();
      if (listError) throw listError;
      const user = listData.users.find((u) => u.email === email);
      if (!user) {
        return new Response(
          JSON.stringify({ error: "not_found", email }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }
      const updates: { password?: string } = {};
      if (password) updates.password = password;
      const { error } = await serviceClient.auth.admin.updateUserById(user.id, updates);
      if (error) throw error;
      await writeAudit(serviceClient, op, email, "allowed", undefined, sourceIp);
      return new Response(
        JSON.stringify({ ok: true, userId: user.id }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (op === "delete") {
      const { data: listData, error: listError } = await serviceClient.auth.admin.listUsers();
      if (listError) throw listError;
      const user = listData.users.find((u) => u.email === email);
      if (!user) {
        // Idempotent: treat as success
        await writeAudit(serviceClient, op, email, "allowed", undefined, sourceIp);
        return new Response(
          JSON.stringify({ ok: true, note: "user not found, treated as deleted" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const { error } = await serviceClient.auth.admin.deleteUser(user.id);
      if (error) throw error;
      await writeAudit(serviceClient, op, email, "allowed", undefined, sourceIp);
      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "internal_error", detail: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Unreachable, but TypeScript needs a return
  return new Response(JSON.stringify({ error: "unhandled_op" }), { status: 500 });
});
