// TIM-2248: public health-check endpoint for the uptime monitor.
//
// Returns 200 + {ok:true} when the app can reach Supabase; returns 503
// otherwise. No auth, no schema info, no row data — only a boolean. The
// monitor (Better Stack / UptimeRobot / etc.) pings this every minute.

import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

async function pingDb(): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const { error } = await supabase
      .from("users")
      .select("id", { head: true, count: "exact" })
      .limit(1)
      .abortSignal(ctrl.signal);
    clearTimeout(timer);
    return !error;
  } catch {
    return false;
  }
}

export async function GET() {
  const dbOk = await pingDb();
  const body = { ok: dbOk };
  return new Response(JSON.stringify(body), {
    status: dbOk ? 200 : 503,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, max-age=0",
    },
  });
}

export async function HEAD() {
  const dbOk = await pingDb();
  return new Response(null, { status: dbOk ? 200 : 503 });
}
