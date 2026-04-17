import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "My Coffee Shop Consultant — Timberline Coffee School",
  description: "An AI-powered planning platform built by a World Coffee Championships judge. Go from idea to open doors with a complete, personalized business plan.",
  keywords: "coffee shop planning, coffee business plan, how to open a coffee shop, coffee shop consultant",
  openGraph: {
    title: "My Coffee Shop Consultant — Timberline Coffee School",
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
    <html lang="en" className="h-full">
      <body className={`${poppins.className} min-h-full flex flex-col bg-[#faf9f7] text-[#1a1a1a]`}>
        {children}
      </body>
    </html>
  );
}
