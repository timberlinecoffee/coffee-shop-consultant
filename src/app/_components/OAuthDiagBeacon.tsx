"use client";

// TIM-2786: client-side beacon fired on /login when the visitor lands here
// after a failed OAuth callback (the "post-callback client redirect path"
// in the CEO directive). Captures cookie names, performance timing, console
// errors, viewport + UA, and the diag-string length the callback redirected
// with — so we can correlate ANY post-bounce state with the corrId emitted
// during the server callback log line. Best-effort: any failure is swallowed.

import { useEffect } from "react";

export function OAuthDiagBeacon({
  corrId,
  errorParam,
  diagLen,
  diagHead,
}: {
  corrId: string | null;
  errorParam: string | null;
  diagLen: number;
  diagHead: string;
}) {
  useEffect(() => {
    // Only fire when the visitor was actually bounced here from /auth/callback.
    if (!errorParam) return;
    if (typeof window === "undefined") return;

    try {
      const cookieNames = document.cookie
        .split(";")
        .map((c) => c.trim().split("=")[0])
        .filter(Boolean);

      // Pull the most recent navigation timing (round-trip from /authorize
      // back to /login). >1s on Safari is a hint at ITP cookie blocking.
      const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      const navMs =
        navEntries.length > 0
          ? Math.floor(navEntries[0].domInteractive)
          : null;

      // Listen for console errors AFTER mount and beacon a second time if
      // any fire in the next 5 seconds (handles late onerror from a CSP
      // violation or a deferred chunk failure). Initial beacon ships even
      // if no console errors have surfaced yet.
      const errs: string[] = [];
      const onError = (e: ErrorEvent) => {
        if (errs.length < 10) errs.push(String(e.message).slice(0, 200));
      };
      window.addEventListener("error", onError);

      const send = () => {
        const beacon = {
          event: "login_bounce_view" as const,
          corrId: corrId ?? "absent",
          ua: navigator.userAgent.slice(0, 200),
          vw: window.innerWidth,
          vh: window.innerHeight,
          cookie_names: cookieNames.slice(0, 80),
          performance_nav_ms: navMs,
          error_param: errorParam,
          diag_len: diagLen,
          diag_head: diagHead.slice(0, 200),
          referrer: document.referrer.slice(0, 200),
          third_party_cookie_hint:
            /Safari/.test(navigator.userAgent) && !/Chrome|Edg/.test(navigator.userAgent)
              ? "safari_check_itp"
              : "other",
          console_errors: errs,
        };
        const body = JSON.stringify(beacon);
        try {
          if (typeof navigator.sendBeacon === "function") {
            navigator.sendBeacon(
              "/api/auth-diag",
              new Blob([body], { type: "application/json" }),
            );
          } else {
            fetch("/api/auth-diag", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
              keepalive: true,
            }).catch(() => {});
          }
        } catch {
          // observation must not break the page
        }
      };

      send();
      const id = window.setTimeout(send, 5000);
      return () => {
        window.removeEventListener("error", onError);
        window.clearTimeout(id);
      };
    } catch {
      return undefined;
    }
  }, [corrId, errorParam, diagLen, diagHead]);

  return null;
}
