import type { Metadata } from "next";
import { Poppins, DM_Sans, Lato, Libre_Baskerville, Nunito, Source_Serif_4 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ["latin"],
  display: 'swap',
});

// Workspace body-font picker options — loaded via next/font so @font-face is injected
// server-side, bypassing the CSS @import-after-declarations issue in Tailwind v4.
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", variable: "--font-dm-sans" });
const lato = Lato({ weight: ["400", "700"], style: ["normal", "italic"], subsets: ["latin"], display: "swap", variable: "--font-lato" });
const libreBaskerville = Libre_Baskerville({ weight: ["400", "700"], style: ["normal", "italic"], subsets: ["latin"], display: "swap", variable: "--font-libre-baskerville" });
const nunito = Nunito({ subsets: ["latin"], display: "swap", variable: "--font-nunito" });
const sourceSerif4 = Source_Serif_4({ subsets: ["latin"], display: "swap", variable: "--font-source-serif-4" });

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${dmSans.variable} ${lato.variable} ${libreBaskerville.variable} ${nunito.variable} ${sourceSerif4.variable}`}>
      <body className={`${poppins.className} min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]`}>
        <a href="#main-content" className="skip-to-main">Skip to main content</a>
        <div id="main-content" tabIndex={-1} className="flex flex-col flex-1">
          {children}
        </div>
        <Analytics />
      </body>
    </html>
  );
}
