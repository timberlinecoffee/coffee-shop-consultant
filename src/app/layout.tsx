import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { cookies } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { CookieConsentBanner } from "@/components/consent/CookieConsentBanner";
import { TrackingScripts } from "@/components/consent/TrackingScripts";
import { CONSENT_COOKIE, parseConsentCookie } from "@/lib/consent/consent";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // TIM-3284: read the consent cookie server-side so the banner's SSR snapshot
  // matches the client one. Returning visitors render with no banner in the
  // served HTML — independent of how fast (or whether) hydration runs.
  const cookieStore = await cookies();
  const initialConsent = parseConsentCookie(cookieStore.get(CONSENT_COOKIE)?.value);

  return (
    <html lang="en" className="h-full">
      <RewardfulScript />
      <body className={`${poppins.className} min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]`}>
        <a href="#main-content" className="skip-to-main">Skip to main content</a>
        <div id="main-content" tabIndex={-1} className="flex flex-col flex-1">
          {children}
        </div>
        <CookieConsentBanner initialConsent={initialConsent} />
        <TrackingScripts />
        <Analytics />
      </body>
    </html>
  );
}
