import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const SAFE_NEXT_PREFIXES = ["/dashboard", "/onboarding", "/plan", "/account", "/reset-password"];

function resolveNext(rawNext: string | null): string | null {
  if (!rawNext) return null;
  if (!rawNext.startsWith("/")) return null;
  if (rawNext.startsWith("//")) return null;
  return SAFE_NEXT_PREFIXES.some(
    prefix => rawNext === prefix || rawNext.startsWith(`${prefix}/`) || rawNext.startsWith(`${prefix}?`)
  )
    ? rawNext
    : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = resolveNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (next) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("onboarding_completed, signup_source")
          .eq("id", user.id)
          .single();

        // Capture signup_source for OAuth users (trigger fires before we have UTM data)
        if (profile && !profile.signup_source) {
          const signupSource = searchParams.get("signup_source") || "direct";
          await supabase.from("users").update({ signup_source: signupSource }).eq("id", user.id);
        }

        if (!profile?.onboarding_completed) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
