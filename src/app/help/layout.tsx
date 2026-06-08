// TIM-1941: shell for the /help routes. Public, no auth gate.
// Top nav + canonical page band (handled per-route by HelpPageHeader) +
// dark footer with the required mailto. Routes nested under /help inherit
// this.

import type { ReactNode } from "react";
import { HelpTopNav } from "./_components/HelpTopNav";
import { HelpFooter } from "./_components/HelpFooter";

export const metadata = {
  title: "Help & Support | Groundwork",
  description:
    "Documentation and support for Groundwork by Timberline Coffee School.",
};

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <HelpTopNav />
      <main className="flex-1 w-full">
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-16">{children}</div>
      </main>
      <HelpFooter />
    </div>
  );
}
