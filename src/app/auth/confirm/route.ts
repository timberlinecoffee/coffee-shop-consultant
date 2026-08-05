// TIM-3441 (2026-08-05): the endpoint that actually confirms an email address.
//
// Until now this route did not exist, and the send-email hook mailed people a
// link to /auth/callback — which only understands the OAuth `?code=` exchange.
// A signup confirmation carries a `token_hash`, not a `code`, so the callback
// fell through to its no-code branch and bounced every new user to
// /login?error=auth_failed while their address stayed unconfirmed. See the
// header note in src/app/api/auth/email-hook/dispatch.ts for the full trace.
//
// This is the documented @supabase/ssr server-side pattern: exchange the
// `token_hash` for a session with `verifyOtp`, let the cookie adapter in
// @/lib/supabase/server write the auth cookies, then redirect. The user lands
// signed in, which is what clicking "Confirm Email" has always implied.
//
// Cache posture is copied from /auth/callback deliberately (TIM-3148): a
// cached 307 on a one-shot token URL would burn the token on a redirect the
// user never sees.

import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveNext } from "@/lib/safe-next";
import { sendWelcomeEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// The `email_action_type` values Supabase Auth can send us, mapped 1:1 onto
// supabase-js `EmailOtpType`. Anything else is refused rather than passed
// through to verifyOtp as an unchecked string.
const VALID_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

// Confirming a signup is the moment the trial genuinely starts, so it is the
// moment the welcome email is honest. `invite` and `email` share the shape.
const WELCOME_ON: ReadonlySet<string> = new Set(["signup", "invite", "email"]);

function applyNoStore(res: NextResponse): NextResponse {
  res.headers.set(
    "Cache-Control",
    "no-store, no-cache, max-age=0, must-revalidate",
  );
  res.headers.set("Pragma", "no-cache");
  return res;
}

// A dead confirmation link must say so. Password recovery has its own
// re-request form and its own banner copy; everything else goes to /login,
// which renders a `confirm_failed` message (see src/app/login/page.tsx).
// Never redirect a failure to a page that looks like success — that is the
// exact failure mode this whole change is undoing.
function failureTarget(origin: string, type: string | null): string {
  if (type === "recovery") return `${origin}/forgot-password?error=expired`;
  return `${origin}/login?error=confirm_failed`;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const next = resolveNext(searchParams.get("next"));

  const type =
    rawType && VALID_TYPES.has(rawType as EmailOtpType)
      ? (rawType as EmailOtpType)
      : null;

  if (!tokenHash || !type) {
    console.warn(
      `[auth-confirm] refusing: token_hash=${tokenHash ? "present" : "absent"} type=${rawType ?? "absent"}`,
    );
    return applyNoStore(
      NextResponse.redirect(failureTarget(origin, rawType)),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    // Expired, already used, or minted for a different project. All three look
    // the same to the user and all three want the same next step: get a fresh
    // link.
    console.warn(
      `[auth-confirm] verifyOtp failed type=${type} err=${error.message?.slice(0, 200)}`,
    );
    return applyNoStore(NextResponse.redirect(failureTarget(origin, type)));
  }

  const user = data.user;

  if (user?.email && WELCOME_ON.has(type)) {
    // Best-effort. The token is single-use, so a second click cannot produce a
    // second welcome — but a Resend outage must never cost the user the
    // confirmation they just completed.
    try {
      const meta = user.user_metadata ?? {};
      const firstName =
        typeof meta.first_name === "string" && meta.first_name.trim()
          ? meta.first_name.trim()
          : null;
      await sendWelcomeEmail({
        to: user.email,
        userId: user.id,
        props: { firstName, dashboardUrl: `${origin}/dashboard` },
      });
    } catch (err) {
      console.error(
        `[auth-confirm] welcome email failed for ${user.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Recovery and email-change links exist to finish a specific errand. Sending
  // those to /onboarding would strand the user without ever letting them set
  // the new password or see the change land, so the onboarding override
  // applies only to the account-activation family.
  let destination: string;
  if (type === "recovery") {
    destination = next ?? "/reset-password";
  } else if (type === "email_change") {
    destination = next ?? "/account";
  } else {
    // An un-onboarded account sent to a deep workspace path renders an empty
    // shell, so onboarding wins over `next` — same precedence as the OAuth
    // callback and the login form.
    destination = next ?? "/dashboard";
    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();
      if (!profile?.onboarding_completed) destination = "/onboarding";
    }
  }

  return applyNoStore(NextResponse.redirect(`${origin}${destination}`));
}
