import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveNext } from "./safe-next";

// TIM-2327: short-lived first-party handoff cookies set by /login before
// signInWithOAuth. Lets us strip query params off `redirectTo` so it matches
// Supabase's Additional Redirect URLs allowlist exactly (bare `/auth/callback`),
// avoiding the Site URL fallback that drops users on apex coming-soon.
const HANDOFF_COOKIES = ["gw_oauth_signup_source", "gw_oauth_next"] as const;

function clearHandoffCookies(res: NextResponse) {
  for (const name of HANDOFF_COOKIES) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const cookieStore = await cookies();

  // Prefer the cookie handoff (OAuth path); fall back to query param for the
  // email-link confirmation flow which still uses `?next=` on emailRedirectTo.
  const next = resolveNext(
    cookieStore.get("gw_oauth_next")?.value ?? searchParams.get("next")
  );

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (next) {
        return clearHandoffCookies(NextResponse.redirect(`${origin}${next}`));
      }

      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("onboarding_completed, signup_source")
          .eq("id", user.id)
          .single();

        // Capture signup_source for OAuth users (trigger fires before we have UTM data)
        if (profile && !profile.signup_source) {
          const signupSource =
            cookieStore.get("gw_oauth_signup_source")?.value ||
            searchParams.get("signup_source") ||
            "direct";
          await supabase.from("users").update({ signup_source: signupSource }).eq("id", user.id);
        }

        if (!profile?.onboarding_completed) {
          return clearHandoffCookies(NextResponse.redirect(`${origin}/onboarding`));
        }
      }
      return clearHandoffCookies(NextResponse.redirect(`${origin}/dashboard`));
    }
  }

  return clearHandoffCookies(NextResponse.redirect(`${origin}/login?error=auth_failed`));
}
