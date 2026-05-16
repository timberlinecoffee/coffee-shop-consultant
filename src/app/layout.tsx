import type { Metadata } from "next";
import { Poppins, Lora, Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-poppins',
});

const lora = Lora({
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-lora',
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "font-sans", geist.variable)}>
      <body className={`${poppins.variable} ${lora.variable} ${poppins.className} min-h-full flex flex-col bg-neutral-100 text-neutral-950`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
