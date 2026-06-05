"use client";

// TIM-2327: backstop for the OAuth hash flow (implicit / legacy). If Supabase
// ever falls back to Site URL and returns tokens in the URL hash
// (#access_token=...&refresh_token=...) instead of the PKCE ?code= query, the
// @supabase/ssr browser client picks up the hash on init (detectSessionInUrl
// is true by default) and writes the session to cookies. We then route to the
// dashboard and scrub the hash so the back button can't replay it.
//
// The PKCE flow (which this codebase uses by default) is handled server-side
// in coming-soon/page.tsx via redirect(/auth/callback?code=...). This handler
// only fires when there's a hash with access_token — otherwise it's inert.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function OAuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token=")) return;

    const supabase = createClient();

    void (async () => {
      // Let detectSessionInUrl do its work, then confirm + route. If the hash
      // contained an error rather than tokens, getSession() returns null and
      // we bounce to /login with a generic error.
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        window.history.replaceState(null, "", window.location.pathname);
        router.replace("/login?error=auth_failed");
        return;
      }
      window.history.replaceState(null, "", window.location.pathname);
      router.replace("/dashboard");
    })();
  }, [router]);

  return null;
}
