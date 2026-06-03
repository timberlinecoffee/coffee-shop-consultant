// TIM-1903: Clears the one-time `trial_just_converted_to` stamp so the
// dashboard welcome toast renders exactly once after a trial converts. The
// Stripe webhook stamps the column on the trialing→active transition; this
// endpoint is called by the toast on first display.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("users")
    .update({ trial_just_converted_to: null })
    .eq("id", user.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
