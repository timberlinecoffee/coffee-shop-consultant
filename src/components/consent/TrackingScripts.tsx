"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useConsent } from "@/lib/consent/useConsent";

/**
 * Consent-gated third-party tracking loader (TIM-1835).
 *
 * Pixels and tags are NEVER injected until BOTH are true:
 *   1. the corresponding ID env var is provisioned, and
 *   2. the visitor has granted the relevant consent category.
 *
 * Until the provisioning ticket sets these env vars, this component renders
 * nothing; the gate is wired and dormant. Consent state gates the *load* of the
 * script, not just event suppression, per the GDPR scope note on the issue.
 *
 *   marketing  -> Meta Pixel, Google Ads
 *   analytics  -> GA4
 *
 * Export/print surfaces never load tracking (white-label safety, TIM-1686).
 */

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GA4_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

export function TrackingScripts() {
  const { consent } = useConsent();
  const pathname = usePathname();

  // Never load tracking on print/export views (a white-labeled artifact must
  // never carry Groundwork analytics).
  if (pathname?.includes("/print")) return null;

  // No decision yet, or necessary-only: load nothing.
  if (!consent) return null;

  const loadMarketing = consent.marketing;
  const loadAnalytics = consent.analytics;

  return (
    <>
      {loadAnalytics && GA4_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA4_ID}', { anonymize_ip: true });`}
          </Script>
        </>
      )}

      {loadMarketing && GOOGLE_ADS_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-ads-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');`}
          </Script>
        </>
      )}

      {loadMarketing && META_PIXEL_ID && (
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
        </Script>
      )}
    </>
  );
}
