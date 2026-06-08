"use client";

// TIM-2246: Cloudflare Turnstile widget (free Cloudflare CAPTCHA alternative).
//
// Renders the widget only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is provisioned.
// When unset the component renders nothing and onVerify is never called — the
// parent form should treat an absent widget as "skip the captcha check".
// This mirrors the server-side helper (src/lib/turnstile.ts), so dev / preview
// without Turnstile env vars still work end-to-end.

import Script from "next/script";
import { useEffect, useRef } from "react";

type RenderOpts = {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
};

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, opts: RenderOpts): string;
      remove(widgetId: string): void;
      reset(widgetId?: string): void;
    };
  }
}

export function TurnstileWidget({
  onVerify,
  onError,
  className = "",
}: {
  onVerify: (token: string | null) => void;
  onError?: () => void;
  className?: string;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    function tryRender() {
      if (cancelled) return;
      if (!window.turnstile || !containerRef.current) {
        setTimeout(tryRender, 100);
        return;
      }
      if (widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey!,
        callback: (token: string) => onVerify(token),
        "error-callback": () => {
          onVerify(null);
          onError?.();
        },
        "expired-callback": () => onVerify(null),
        theme: "light",
        size: "flexible",
      });
    }
    tryRender();
    const id = widgetIdRef.current;
    return () => {
      cancelled = true;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          // widget may have been auto-removed; ignore
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, onVerify, onError]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div ref={containerRef} className={className} aria-label="Bot protection" />
    </>
  );
}

export function turnstileEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
