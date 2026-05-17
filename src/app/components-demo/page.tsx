"use client";

import { useState } from "react";
import {
  WorkspaceModuleCard,
  CoPilotInput,
  ReadinessRing,
  PricingTierCard,
  AppNavigation,
} from "@/components/hero";
import {
  ModuleConceptIcon,
  ModuleFinancialsIcon,
  ModuleOperationsIcon,
  ModuleStaffingIcon,
  ModuleBuildOutIcon,
  ModuleMenuIcon,
  ModuleMarketingIcon,
  ModuleLaunchIcon,
} from "@/lib/icons";
import type { ModulePercentages } from "@/components/hero";
import type { PricingTier } from "@/components/hero";

const DEMO_PERCENTAGES: ModulePercentages = [100, 72, 40, 0, 0, 0, 0, 0];

const MODULE_ICONS = [
  ModuleConceptIcon,
  ModuleFinancialsIcon,
  ModuleOperationsIcon,
  ModuleStaffingIcon,
  ModuleBuildOutIcon,
  ModuleMenuIcon,
  ModuleMarketingIcon,
  ModuleLaunchIcon,
];

const MODULE_NAMES = [
  "Concept",
  "Financials",
  "Operations",
  "Staffing",
  "Build-Out",
  "Menu",
  "Marketing",
  "Launch",
];

const PRICING_TIERS: PricingTier[] = [
  {
    name: "Solo",
    price: 29,
    features: [
      "All 8 planning modules",
      "AI co-pilot (50 questions/month)",
      "PDF export",
    ],
    ctaLabel: "Start your plan",
    ctaHref: "/signup",
  },
  {
    name: "Pro",
    price: 79,
    features: [
      "All 8 planning modules",
      "AI co-pilot (unlimited)",
      "PDF export with your branding",
      "Lender-ready financial projections",
    ],
    ctaLabel: "Start your plan",
    ctaHref: "/signup?plan=pro",
    isSelected: true,
  },
  {
    name: "Team",
    price: 149,
    features: [
      "Everything in Pro",
      "Up to 5 collaborators",
      "Version history",
      "Priority support",
    ],
    ctaLabel: "Start your plan",
    ctaHref: "/signup?plan=team",
  },
];

export default function ComponentsDemoPage() {
  const [activeModule, setActiveModule] = useState(1);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [copilotResponse, setCopilotResponse] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);

  async function handleCopilotSubmit(message: string) {
    setCopilotLoading(true);
    setCopilotResponse("");
    const demo = `You asked: "${message}". This is a demo response from the co-pilot. In production, this text streams word by word.`;
    for (let i = 0; i < demo.length; i++) {
      await new Promise((r) => setTimeout(r, 18));
      setCopilotResponse(demo.slice(0, i + 1));
    }
    setCopilotLoading(false);
  }

  return (
    <div
      className="min-h-screen bg-[var(--neutral-100)]"
      style={{ fontFamily: "var(--font-sans, Poppins, system-ui, sans-serif)" }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        <header>
          <h1
            className="font-bold text-[var(--neutral-950)]"
            style={{ fontSize: "var(--text-h1)", lineHeight: "var(--text-h1-lh)" }}
          >
            Component Library
          </h1>
          <p
            className="mt-2 text-[var(--neutral-600)]"
            style={{ fontSize: "var(--text-body-lg)", lineHeight: "var(--text-body-lg-lh)" }}
          >
            Five hero components — design-direction v3 Section 6.
          </p>
        </header>

        {/* ── Component 1: WorkspaceModuleCard ──────────────────────────── */}
        <section aria-labelledby="c1-heading">
          <h2
            id="c1-heading"
            className="font-semibold text-[var(--neutral-950)] mb-4"
            style={{ fontSize: "var(--text-h2)", lineHeight: "var(--text-h2-lh)" }}
          >
            1. Workspace Module Card
          </h2>
          <div className="flex flex-col gap-2 max-w-md">
            {MODULE_NAMES.map((name, i) => (
              <WorkspaceModuleCard
                key={name}
                moduleName={name}
                moduleNumber={i + 1}
                completionPercent={DEMO_PERCENTAGES[i] ?? 0}
                Icon={MODULE_ICONS[i]}
                onClick={() => setActiveModule(i + 1)}
              />
            ))}
          </div>
        </section>

        {/* ── Component 2: CoPilotInput ─────────────────────────────────── */}
        <section aria-labelledby="c2-heading">
          <h2
            id="c2-heading"
            className="font-semibold text-[var(--neutral-950)] mb-4"
            style={{ fontSize: "var(--text-h2)", lineHeight: "var(--text-h2-lh)" }}
          >
            2. AI Co-pilot Input
          </h2>
          <div
            className="max-w-lg rounded-lg overflow-hidden border border-[var(--neutral-300)] bg-[var(--color-white)]"
          >
            <div className="h-40 flex items-center justify-center bg-[var(--neutral-200)]">
              <p
                className="text-[var(--neutral-500)]"
                style={{ fontSize: "var(--text-body-sm)", lineHeight: "var(--text-body-sm-lh)" }}
              >
                Workspace content above
              </p>
            </div>
            <CoPilotInput
              onSubmit={handleCopilotSubmit}
              response={copilotResponse}
              isLoading={copilotLoading}
            />
          </div>
        </section>

        {/* ── Component 3: ReadinessRing ────────────────────────────────── */}
        <section aria-labelledby="c3-heading">
          <h2
            id="c3-heading"
            className="font-semibold text-[var(--neutral-950)] mb-4"
            style={{ fontSize: "var(--text-h2)", lineHeight: "var(--text-h2-lh)" }}
          >
            3. Readiness Ring
          </h2>
          <div className="flex flex-wrap gap-12 items-center">
            <div className="flex flex-col items-center gap-2">
              <ReadinessRing modulePercentages={DEMO_PERCENTAGES} />
              <p
                className="text-[var(--neutral-600)]"
                style={{ fontSize: "var(--text-caption)", lineHeight: "var(--text-caption-lh)" }}
              >
                Mixed progress
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ReadinessRing modulePercentages={[0, 0, 0, 0, 0, 0, 0, 0]} />
              <p
                className="text-[var(--neutral-600)]"
                style={{ fontSize: "var(--text-caption)", lineHeight: "var(--text-caption-lh)" }}
              >
                No progress
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ReadinessRing modulePercentages={[100, 100, 100, 100, 100, 100, 100, 100]} />
              <p
                className="text-[var(--neutral-600)]"
                style={{ fontSize: "var(--text-caption)", lineHeight: "var(--text-caption-lh)" }}
              >
                Complete
              </p>
            </div>
          </div>
        </section>

        {/* ── Component 4: PricingTierCard ──────────────────────────────── */}
        <section aria-labelledby="c4-heading">
          <h2
            id="c4-heading"
            className="font-semibold text-[var(--neutral-950)] mb-4"
            style={{ fontSize: "var(--text-h2)", lineHeight: "var(--text-h2-lh)" }}
          >
            4. Pricing Tier Card
          </h2>
          <PricingTierCard tiers={PRICING_TIERS} />
        </section>

        {/* ── Component 5: AppNavigation ────────────────────────────────── */}
        <section aria-labelledby="c5-heading">
          <h2
            id="c5-heading"
            className="font-semibold text-[var(--neutral-950)] mb-4"
            style={{ fontSize: "var(--text-h2)", lineHeight: "var(--text-h2-lh)" }}
          >
            5. Navigation
          </h2>
          <div
            className="border border-[var(--neutral-300)] rounded-lg overflow-hidden"
            style={{ height: "480px", display: "flex" }}
          >
            <AppNavigation
              activeModule={activeModule}
              onModuleClick={setActiveModule}
              userName="Alex Chen"
              collapsed={navCollapsed}
              onCollapsedChange={setNavCollapsed}
              className="relative hidden md:flex"
            />
            <div className="flex-1 flex items-center justify-center bg-[var(--neutral-100)]">
              <p
                className="text-[var(--neutral-500)]"
                style={{ fontSize: "var(--text-body)", lineHeight: "var(--text-body-lh)" }}
              >
                Active module: {activeModule} ({MODULE_NAMES[activeModule - 1]})
              </p>
            </div>
          </div>
          <p
            className="mt-2 text-[var(--neutral-500)]"
            style={{ fontSize: "var(--text-caption)", lineHeight: "var(--text-caption-lh)" }}
          >
            Click the sidebar toggle to collapse. Sidebar is hidden below 768px breakpoint.
          </p>
        </section>
      </div>
    </div>
  );
}
