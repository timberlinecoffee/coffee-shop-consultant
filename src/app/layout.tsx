import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { CookieConsentBanner } from "@/components/consent/CookieConsentBanner";
import { TrackingScripts } from "@/components/consent/TrackingScripts";
import { CONSENT_COOKIE } from "@/lib/consent/consent";
import { RewardfulScript } from "./_components/RewardfulScript";
import "./globals.css";

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "My Coffee Shop Consultant: Timberline Coffee School",
  description: "An AI-powered planning platform built by a World Coffee Championships judge. Go from idea to open doors with a complete, personalized business plan.",
  keywords: "coffee shop planning, coffee business plan, how to open a coffee shop, coffee shop consultant",
  openGraph: {
    title: "My Coffee Shop Consultant: Timberline Coffee School",
    description: "Plan your coffee shop with an AI coach trained on real-world expertise.",
    siteName: "Timberline Coffee School",
  },
};

// TIM-3284: pre-hydration cookie probe. Sets data-consent-decided=1 on <html>
// before first paint when gw_consent is present, so the CSS rule in globals.css
// hides the consent banner element on returning visits — independent of how
// fast (or whether) React hydration runs. The script is a static string so the
// root layout stays static (no cookies()/headers() call → no dynamic opt-in →
// Lighthouse perf score unaffected). React state still owns reset (Cookie
// Preferences) and Accept-All transitions; this only suppresses the SSR-default
// "show" state when the cookie already exists at first paint.
const CONSENT_PRE_HYDRATION_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${CONSENT_COOKIE}=([^;]*)/);if(!m||!m[1])return;var v=JSON.parse(decodeURIComponent(m[1]));if(v&&v.version===1){document.documentElement.setAttribute("data-consent-decided","1");}}catch(_){/* fall through to React */}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <RewardfulScript />
      <body className={`${poppins.className} min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]`}>
        <script dangerouslySetInnerHTML={{ __html: CONSENT_PRE_HYDRATION_SCRIPT }} />
        <a href="#main-content" className="skip-to-main">Skip to main content</a>
        <div id="main-content" tabIndex={-1} className="flex flex-col flex-1">
          {children}
        </div>
        <CookieConsentBanner />
        <TrackingScripts />
        <Analytics />
      </body>
    </html>
  );
}
