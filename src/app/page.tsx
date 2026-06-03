import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CookiePreferencesLink } from "@/components/consent/CookiePreferencesLink";
import HomeNav from "./_components/HomeNav";
import { Logo } from "./_components/Logo";
import HomepageHero from "./_components/HomepageHero";
import FeatureAccordion, { type AccordionItem } from "./_components/FeatureAccordion";
import BenefitSections from "./_components/BenefitSections";
import {
  FadeUp,
  ScaleIn,
  StaggerContainer,
  StaggerItem,
} from "./_components/AnimatedElements";
import ModuleCard from "./_components/ModuleCard";
import PricingCard, { type PricingPlan } from "./_components/PricingCard";

export const metadata: Metadata = {
  title: "Groundwork: From Coffee Shop Idea to Open Sign.",
  description:
    "Build your coffee shop plan, even without a business background. Groundwork shows you what to plan next, checks it against real shops, and points to your next move.",
  openGraph: {
    title: "Groundwork: From Coffee Shop Idea to Open Sign.",
    description:
      "Build your coffee shop plan, even without a business background. Groundwork fills the gaps.",
    siteName: "Groundwork",
  },
};

// Pexels photos by Ketut Subiyanto (Pexels License — free for commercial use)
const PEXELS = {
  // Coffee shop team reviewing their plan together
  teamPlanning:
    "https://images.pexels.com/photos/4350093/pexels-photo-4350093.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1",
  // Barista pouring steamed milk at the espresso machine — operator at work
  baristaMilk:
    "https://images.pexels.com/photos/4350048/pexels-photo-4350048.jpeg?auto=compress&cs=tinysrgb&w=1100&h=700&dpr=1",
  // Cafe owners in aprons collaborating — owner/operator scene
  ownersCollab:
    "https://images.pexels.com/photos/4350061/pexels-photo-4350061.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1",
};

const SUITE_ITEMS: AccordionItem[] = [
  {
    accent: "teal",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "AI-Guided Planning",
    oneLiner:
      "Walks you through every owner decision in the right order.",
    bullets: [
      "Concept, location, menu, financials, staffing, build-out, launch: eight modules in sequence",
      "Asks for the inputs that matter, skips the ones that don't",
      "Saves your answers and shows what's left",
    ],
  },
  {
    accent: "sage",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>
      </svg>
    ),
    title: "Real Benchmarking",
    oneLiner:
      "Holds your numbers up against what real coffee shops look like.",
    bullets: [
      "Startup cost, rent, COGS, labor and margin flagged when they drift",
      "Modeled from coffee-shop research and operator-reported data, not generic templates",
      "Updates live so you can stress-test before you sign anything",
    ],
  },
  {
    accent: "teal",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
    title: "Action at Every Step",
    oneLiner:
      "Turns every module into a clear next thing to do this week.",
    bullets: [
      "Milestone list tied to your open date",
      "One next action at every step, so you don't stall in research mode",
      "Tracks what's done and what's outstanding",
    ],
  },
  {
    accent: "sage",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    title: "Complete Planning Suite",
    oneLiner:
      "What you'd piece together from eight tools, in one place.",
    bullets: [
      "Financial model, menu pricing, staffing, build-out and launch plan share the same inputs",
      "Change one assumption and every downstream module updates",
      "Exportable summaries for landlord and lender conversations (not a CPA-prepared package)",
    ],
  },
  {
    accent: "teal",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    title: "Operational Tools",
    oneLiner:
      "Goes past pre-open paperwork through opening day.",
    bullets: [
      "Hiring, onboarding and shift planning ready for week one",
      "Menu pricing and recipe costing you can update as suppliers change",
      "Launch-day checklist tied to your milestones",
    ],
  },
];

const BENCHMARK_STEPS: AccordionItem[] = [
  {
    step: "01",
    accent: "teal",
    title: "Get Guided Through Every Decision",
    oneLiner:
      "Stop wondering what you should be working on this week.",
    bullets: [
      "Eight modules walk you through the full plan",
      "Each module asks for what matters and shows what's missing",
      "The next action stays visible so you don't sit staring at a blank page",
    ],
  },
  {
    step: "02",
    accent: "sage",
    title: "See How Your Plan Compares",
    oneLiner:
      "Know if your numbers are realistic before a landlord or lender does.",
    bullets: [
      "Startup cost, rent, COGS and labor benchmarked against real shops",
      "Drift flags tell you which assumption is breaking the model",
      "Re-run as soon as a lease term or supplier price changes",
    ],
  },
  {
    step: "03",
    accent: "teal",
    title: "Take Action Toward Opening",
    oneLiner:
      "Turn the plan into a launch you can actually run.",
    bullets: [
      "Milestone-based launch plan tied to your open date",
      "Hiring, onboarding and soft-open checklists wired to the same plan",
      "Track what's done and what's next without a separate project tool",
    ],
  },
];

const FOUNDER_QUOTE = {
  body: "Most people who open a coffee shop don't have a business background. Build your plan thoughtfully, even without one. Groundwork fills the gaps so you can plan your shop intentionally.",
  attribution: "Trent Rollings",
  role: "Founder, Timberline Coffee School",
};

const PROOF_TILES = [
  {
    eyebrow: "Built by an Operator",
    title: "Authored by a Working Coffee Shop Owner",
    body: "Groundwork is built by Trent Rollings, founder of Timberline Coffee School, drawing on day-to-day specialty coffee operations rather than generic business templates.",
  },
  {
    eyebrow: "Plan Coverage",
    title: "Every Module a Lender Expects",
    body: "Concept, market, location, menu, equipment, hiring, financials, and launch plan are all wired to the same source of truth, so updates in one module flow through the rest.",
  },
  {
    eyebrow: "Financial Model",
    title: "Stress-Test Lease and Pricing Scenarios",
    body: "Adjust rent, opening date, ticket size, or daily transactions and the projection refreshes immediately. Outputs are planning estimates only; review with a licensed accountant before signing.",
  },
];

const PRICING: PricingPlan[] = [
  {
    name: "Starter",
    price: "$39",
    period: "/month",
    note: "$299/yr billed annually. 7-day free trial. Cancel before day 7 and you won't be charged.",
    features: [
      "All planning workspaces",
      "Scout AI assistant: chat and section generation",
      "Investor-ready PDF export",
      "100 AI planning credits/month",
    ],
    cta: "Start your 7-day free trial",
    href: "/signup",
    recommended: false,
    accent: false,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/month",
    note: "$799/yr billed annually. 7-day free trial. Cancel before day 7 and you won't be charged.",
    features: [
      "Everything in Starter",
      "Deep market research",
      "Pricing benchmarks vs. real shops",
      "Unlimited locations and projects",
      "Priority support",
      "500 AI planning credits/month",
    ],
    cta: "Start your 7-day free trial",
    href: "/signup",
    recommended: true,
    accent: true,
  },
];

const FOOTER_COLS = [
  {
    heading: "Product",
    links: [
      { label: "How It Works", href: "#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Sign In", href: "/login" },
      { label: "Start Your Plan", href: "/signup" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Timberline Coffee School", href: "https://timberline.coffee" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of Use", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Subscription Terms", href: "/subscription-terms" },
      { label: "Cookie Preferences", href: "#cookie-preferences" },
    ],
  },
  {
    heading: "Contact",
    links: [
      { label: "hello@timberline.coffee", href: "mailto:hello@timberline.coffee" },
    ],
  },
];

export default function LandingPage() {
  return (
    <main className="flex flex-col">
      <HomeNav />
      <HomepageHero />

      {/* ── Value props strip ────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-neutral-200" style={{ padding: "56px 24px" }}>
        <div className="max-w-5xl mx-auto">
          <FadeUp>
            <p
              className="text-center font-semibold uppercase mb-10"
              style={{ fontSize: "11px", letterSpacing: "0.14em", color: "var(--sage)" }}
            >
              Built for Owner-Operators
            </p>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "Guided Through Every Decision",
                body: "Eight modules in order. You always know what to plan next.",
                color: "teal" as const,
              },
              {
                title: "Benchmarked Against Real Shops",
                body: "Your numbers sit next to what real coffee shops actually look like.",
                color: "sage" as const,
              },
              {
                title: "Scout in Your Corner",
                body: "Ask about your lease, menu, or equipment. Get answers tied to your plan.",
                color: "teal" as const,
              },
            ].map((item) => (
              <StaggerItem key={item.title}>
                <div>
                  <p
                    className="font-semibold mb-2"
                    style={{
                      fontSize: "17px",
                      color: item.color === "sage" ? "var(--sage)" : "var(--teal)",
                      lineHeight: 1.3,
                    }}
                  >
                    {item.title}
                  </p>
                  <p className="text-neutral-600" style={{ fontSize: "16px", lineHeight: 1.6 }}>
                    {item.body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Groundwork Suite — accordion of platform capabilities ──────────────── */}
      <section id="how-it-works" style={{ background: "var(--neutral-50, var(--neutral-50))", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-12">
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--sage)" }}
            >
              The Groundwork Suite
            </p>
            <h2
              className="font-bold"
              style={{
                fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
                lineHeight: 1.2,
                fontWeight: 700,
                color: "var(--teal)",
              }}
            >
              A Guided Suite for the Whole Journey
            </h2>
          </FadeUp>
          <FeatureAccordion items={SUITE_ITEMS} layout="icon" columns={3} />
        </div>
      </section>

      {/* ── AI planning co-pilot companion ────────────────────────────────────────
          Sage-tinted bg. Left: copy with benchmarking angle. Right: chat mockup.
      ─────────────────────────────────────────────────────────────────────────── */}
      <section
        style={{ background: "rgba(118,179,157,0.06)", padding: "96px 24px", borderTop: "1px solid rgba(118,179,157,0.15)", borderBottom: "1px solid rgba(118,179,157,0.15)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            {/* Left */}
            <div>
              <FadeUp>
                <p
                  className="font-semibold uppercase mb-4"
                  style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--sage)" }}
                >
                  Scout, AI Planning Assistant
                </p>
                <h2
                  className="font-bold mb-5"
                  style={{
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    lineHeight: 1.22,
                    fontWeight: 700,
                    color: "var(--teal)",
                  }}
                >
                  Scout, Your Coffee-Specific AI Assistant
                </h2>
                <p className="text-neutral-600 mb-8 leading-relaxed" style={{ fontSize: "1.0625rem" }}>
                  Ask about your market, lease, or equipment. Get coffee-specific answers tied
                  to your plan, not generic small-business advice.
                </p>
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: "Coffee-Specific Guidance", color: "sage" },
                    { label: "Tied to Your Plan, Not Generic", color: "teal" },
                    { label: "Available at Every Step", color: "sage" },
                  ].map((tag) => (
                    <span
                      key={tag.label}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                      style={{
                        background: tag.color === "sage" ? "rgba(118,179,157,0.12)" : "rgba(21,94,99,0.08)",
                        color: tag.color === "sage" ? "var(--sage)" : "var(--teal)",
                      }}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
                <p
                  className="mt-6 text-neutral-500 italic"
                  style={{ fontSize: "12px", lineHeight: 1.5, maxWidth: "460px" }}
                >
                  AI responses are planning support, not professional advice.
                  Verify any financial, legal, or regulatory output with a
                  licensed advisor before acting on it.
                </p>
              </FadeUp>
            </div>

            {/* Right */}
            <ScaleIn delay={0.1}>
              <AIChatMockup />
            </ScaleIn>
          </div>
        </div>
      </section>

      {/* ── Guided. Benchmarked. Moving. — accordion + photo ───────────────────── */}
      <section className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-12">
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--sage)" }}
            >
              How It Works
            </p>
            <h2
              className="font-bold"
              style={{
                fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
                lineHeight: 1.2,
                fontWeight: 700,
                color: "var(--teal)",
              }}
            >
              Guided. Benchmarked. Moving.
            </h2>
            <p
              className="mx-auto mt-4 text-neutral-600"
              style={{ fontSize: "17px", lineHeight: 1.55, maxWidth: "560px" }}
            >
              Three habits the platform builds into your week.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
            {/* Photo + floating card — 2 cols */}
            <ScaleIn className="lg:col-span-2 relative">
              <div className="rounded-2xl overflow-hidden aspect-[4/5] relative">
                <Image
                  src={PEXELS.teamPlanning}
                  alt="Coffee shop owners reviewing their plan together. Photo: Ketut Subiyanto / Pexels."
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom right, transparent 60%, rgba(14,68,72,0.18) 100%)",
                  }}
                />
              </div>
              <div
                className="absolute bottom-4 left-4 rounded-xl px-4 py-3"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(118,179,157,0.25)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: "var(--sage)" }}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>
                    Plan Benchmark: Healthy
                  </p>
                </div>
                <p className="text-neutral-600" style={{ fontSize: "11px" }}>
                  Your startup cost is within range
                </p>
              </div>
            </ScaleIn>

            {/* Accordion + CTA — 3 cols */}
            <div className="lg:col-span-3 space-y-4">
              <FeatureAccordion items={BENCHMARK_STEPS} layout="step" columns={1} />
              <FadeUp delay={0.2}>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center w-full px-6 py-3 rounded-lg font-semibold text-sm text-white transition-all mt-2"
                  style={{ background: "var(--teal)" }}
                >
                  Start Your Plan &rarr;
                </Link>
              </FadeUp>
            </div>
          </div>
        </div>
      </section>

      {/* ── Module snapshots strip ────────────────────────────────────────────── */}
      <section
        style={{
          background: "rgba(118,179,157,0.06)",
          padding: "96px 24px",
          borderTop: "1px solid rgba(118,179,157,0.15)",
          borderBottom: "1px solid rgba(118,179,157,0.15)",
        }}
      >
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-14">
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--sage)" }}
            >
              Inside the Platform
            </p>
            <h2
              className="font-bold"
              style={{
                fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)",
                lineHeight: 1.2,
                fontWeight: 700,
                color: "var(--teal)",
              }}
            >
              Every Tool Built for a Specific Decision
            </h2>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StaggerItem className="h-full">
              <ModuleCard
                title="Financials"
                description="Startup costs and 12-month projections, benchmarked live."
                mockup={<FinancialsMockup />}
                thumbnailSrc="https://images.pexels.com/photos/4350048/pexels-photo-4350048.jpeg?auto=compress&cs=tinysrgb&w=600&h=280&dpr=1"
                thumbnailAlt="Coffee shop owner reviewing financial spreadsheets"
              />
            </StaggerItem>
            <StaggerItem className="h-full">
              <ModuleCard
                title="Menu Pricing"
                description="Cost-per-cup analysis with margin targets and industry benchmarks."
                mockup={<MenuMockup />}
                thumbnailSrc="https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=600&h=280&dpr=1"
                thumbnailAlt="Barista preparing espresso drinks at a coffee bar"
              />
            </StaggerItem>
            <StaggerItem className="h-full">
              <ModuleCard
                title="Launch Plan"
                description="Milestone-based plan tied to your open date, with next actions always visible."
                mockup={<LaunchMockup />}
                thumbnailSrc="https://images.pexels.com/photos/4350093/pexels-photo-4350093.jpeg?auto=compress&cs=tinysrgb&w=600&h=280&dpr=1"
                thumbnailAlt="Coffee shop team reviewing their launch plan together"
              />
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ── Photography-integrated benefit sections (additive, TIM-1320) ───────── */}
      <BenefitSections />

      {/* ── Founder pull-quote + barista photo ────────────────────────────────── */}
      <section className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            {/* Barista photo — 2 cols */}
            <ScaleIn className="lg:col-span-2 relative">
              <div className="rounded-2xl overflow-hidden aspect-[4/5] relative">
                <Image
                  src={PEXELS.baristaMilk}
                  alt="Barista steaming milk at the espresso machine on opening day. Photo: Ketut Subiyanto / Pexels."
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom right, transparent 55%, rgba(14,68,72,0.22) 100%)",
                  }}
                />
              </div>
            </ScaleIn>

            {/* Founder pull-quote — 3 cols */}
            <FadeUp className="lg:col-span-3">
              <p
                className="font-semibold uppercase mb-4"
                style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--sage)" }}
              >
                From the Founder
              </p>
              <blockquote
                className="text-neutral-800 mb-6"
                style={{
                  fontSize: "clamp(1.25rem, 2.4vw, 1.625rem)",
                  lineHeight: 1.4,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                }}
              >
                &ldquo;{FOUNDER_QUOTE.body}&rdquo;
              </blockquote>
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                  style={{ background: "var(--teal)", fontSize: "14px" }}
                >
                  T
                </div>
                <div>
                  <p className="font-semibold" style={{ fontSize: "14px", color: "var(--teal)" }}>
                    {FOUNDER_QUOTE.attribution}
                  </p>
                  <p className="text-neutral-500" style={{ fontSize: "12px", marginTop: "1px" }}>
                    {FOUNDER_QUOTE.role}
                  </p>
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── Why Groundwork ────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--neutral-50, var(--neutral-50))", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-12">
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--sage)" }}
            >
              Why Groundwork
            </p>
            <h2
              className="font-bold"
              style={{ fontSize: "clamp(1.5rem, 3.5vw, 2rem)", lineHeight: 1.25, fontWeight: 700, color: "var(--teal)" }}
            >
              Built for the Part You Don&apos;t Know You Don&apos;t Know
            </h2>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PROOF_TILES.map((tile, i) => (
              <StaggerItem key={tile.title} className="h-full">
                <div
                  className="bg-white rounded-xl p-6 border border-neutral-200 hover:border-teal/30 hover:-translate-y-1 transition-all duration-200 h-full flex flex-col"
                  style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                >
                  <div
                    className="w-8 h-0.5 mb-5"
                    style={{ background: i % 2 === 0 ? "var(--teal)" : "var(--sage)" }}
                  />
                  <p
                    className="font-semibold uppercase mb-3"
                    style={{
                      fontSize: "11px",
                      letterSpacing: "0.12em",
                      color: i % 2 === 0 ? "var(--teal)" : "var(--sage)",
                    }}
                  >
                    {tile.eyebrow}
                  </p>
                  <h3
                    className="font-semibold mb-3 text-neutral-900"
                    style={{ fontSize: "1.05rem", lineHeight: 1.35, fontWeight: 600 }}
                  >
                    {tile.title}
                  </h3>
                  <p
                    className="text-neutral-700 flex-1"
                    style={{
                      fontSize: "0.95rem",
                      lineHeight: 1.6,
                      fontWeight: 400,
                    }}
                  >
                    {tile.body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ── CTA break — gradient ──────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(130deg, var(--teal-darkest) 0%, var(--teal) 55%, var(--teal-bright) 100%)",
          padding: "88px 24px",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute pointer-events-none" style={{ top: "-100px", right: "-80px", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(118,179,157,0.15) 0%, transparent 70%)" }} />
        <div className="relative z-10 max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-8">
          <FadeUp>
            <h2
              className="text-white font-bold mb-2"
              style={{
                fontSize: "clamp(1.4rem, 3vw, 1.875rem)",
                lineHeight: 1.2,
                fontWeight: 700,
                maxWidth: "520px",
              }}
            >
              Build Your Coffee Shop Plan, Even Without a Business Background
            </h2>
            <p style={{ color: "rgba(255,255,255,0.82)", fontSize: "1.0625rem", lineHeight: 1.6, maxWidth: "520px" }}>
              Groundwork fills the gaps so you can plan your shop intentionally.
            </p>
          </FadeUp>
          <FadeUp delay={0.15}>
            <Link
              href="/signup"
              className="flex-shrink-0 inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-semibold text-sm transition-all"
              style={{
                background: "white",
                color: "var(--teal)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              }}
            >
              Start Your Plan
            </Link>
          </FadeUp>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ background: "var(--neutral-50, var(--neutral-50))", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-14">
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--sage)" }}
            >
              Pricing
            </p>
            <h2
              className="font-bold"
              style={{
                fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
                lineHeight: 1.2,
                fontWeight: 700,
                color: "var(--teal)",
              }}
            >
              Two plans. One goal: open with a plan that works.
            </h2>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {PRICING.map((plan) => (
              <StaggerItem key={plan.name} className="h-full">
                <PricingCard plan={plan} />
              </StaggerItem>
            ))}
          </StaggerContainer>
          <FadeUp delay={0.3}>
            <p className="text-center text-neutral-500 mt-6" style={{ fontSize: "14px", fontWeight: 500 }}>
              Try Pro free for 7 days. We&apos;ll remind you before your trial ends.
            </p>
            <p className="text-center text-neutral-400 mt-2" style={{ fontSize: "12px" }}>
              A card is required at signup. Cancel before day 7 and you won&apos;t be charged. See{" "}
              <Link href="/subscription-terms" className="underline">
                Subscription Terms
              </Link>
              .
            </p>
          </FadeUp>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer style={{ background: "var(--neutral-900)", padding: "64px 24px 40px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="mb-10">
            <Logo variant="white" height={30} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
            {FOOTER_COLS.map((col) => (
              <div key={col.heading}>
                <p
                  className="font-semibold uppercase mb-4"
                  style={{ color: "var(--neutral-500)", fontSize: "11px", letterSpacing: "0.08em" }}
                >
                  {col.heading}
                </p>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {link.href === "#cookie-preferences" ? (
                        <CookiePreferencesLink
                          className="transition-colors text-left"
                          style={{ color: "var(--neutral-400)", fontSize: "14px", textDecoration: "none" }}
                        />
                      ) : (
                        <Link
                          href={link.href}
                          className="transition-colors"
                          style={{ color: "var(--neutral-400)", fontSize: "14px", textDecoration: "none" }}
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div
            className="border-t pt-8 flex flex-col gap-4"
            style={{ borderColor: "var(--neutral-800)" }}
          >
            <p
              className="italic"
              style={{ color: "var(--neutral-500)", fontSize: "12px", lineHeight: 1.55 }}
            >
              Groundwork uses AI to help you plan a coffee shop. AI outputs are
              planning estimates and educational support, not financial, legal,
              tax, or investment advice. Verify any financial, regulatory, or
              contractual decisions with a licensed professional before acting.
              Past results in other markets do not guarantee outcomes for your
              shop.
            </p>
            <div className="flex flex-col sm:flex-row justify-between gap-3">
              <p style={{ color: "var(--neutral-600)", fontSize: "13px" }}>
                &copy; {new Date().getFullYear()} Timberline Coffee School. All rights reserved.
              </p>
              <p style={{ color: "var(--neutral-600)", fontSize: "13px" }}>
                Groundwork is a product of Timberline Coffee School.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ── AIChatMockup ─────────────────────────────────────────────────────────── */

function AIChatMockup() {
  const messages = [
    {
      role: "user" as const,
      text: "What startup cost should I plan for a 900 sq ft cafe in a mid-size city?",
    },
    {
      role: "assistant" as const,
      text: "For a 900 sq ft buildout in a mid-size market, I'd plan $110k–$165k all-in. Here's how I'd break it down:",
    },
    {
      role: "assistant" as const,
      list: [
        "Espresso equipment: $22–38k",
        "Renovation: $35–65k",
        "FF&E: $12–22k",
        "Working capital: $20–30k",
      ],
    },
    {
      role: "benchmark" as const,
      text: "Your current estimate of $142k is within the healthy range for this market size.",
    },
    {
      role: "user" as const,
      text: "What should I watch out for on the renovation estimate?",
    },
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden border border-neutral-200"
      style={{
        boxShadow: "0 16px 48px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200"
        style={{ background: "white" }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(21,94,99,0.1)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <p className="font-semibold" style={{ fontSize: "13px", color: "var(--teal)" }}>
            Scout — AI Coffee Planning Assistant
          </p>
          <p style={{ color: "var(--neutral-500)", fontSize: "11px" }}>
            Specialty-specific planning support, benchmarked
          </p>
        </div>
        <div className="ml-auto w-2 h-2 rounded-full" style={{ background: "var(--success-text)", flexShrink: 0 }} />
      </div>

      {/* Messages */}
      <div className="p-4 space-y-3" style={{ background: "var(--neutral-50)" }}>
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "benchmark" ? (
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{
                  background: "rgba(118,179,157,0.1)",
                  border: "1px solid rgba(118,179,157,0.25)",
                }}
              >
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--sage)" }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <p style={{ fontSize: "11px", color: "var(--teal)", fontWeight: 500 }}>{msg.text}</p>
              </div>
            ) : (
              <div
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mr-2 mt-0.5"
                    style={{ background: "rgba(21,94,99,0.1)" }}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                )}
                <div
                  className="rounded-xl px-3 py-2 max-w-xs"
                  style={{
                    background: msg.role === "user" ? "var(--teal)" : "white",
                    borderRadius:
                      msg.role === "user" ? "14px 14px 2px 14px" : "2px 14px 14px 14px",
                    border: msg.role === "assistant" ? "1px solid var(--border-subtle)" : "none",
                  }}
                >
                  {msg.text && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: msg.role === "user" ? "rgba(255,255,255,0.92)" : "var(--neutral-800)",
                        lineHeight: 1.5,
                      }}
                    >
                      {msg.text}
                    </p>
                  )}
                  {msg.list && (
                    <ul className="space-y-1">
                      {msg.list.map((item, j) => (
                        <li key={j} className="flex gap-1.5">
                          <span style={{ color: "var(--sage)", fontSize: "11px", flexShrink: 0 }}>
                            &#10003;
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--neutral-800)", lineHeight: 1.4 }}>
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {/* Typing indicator */}
        <div className="flex justify-start">
          <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mr-2" style={{ background: "rgba(21,94,99,0.1)" }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-1" style={{ background: "white", border: "1px solid var(--border-subtle)", borderRadius: "2px 14px 14px 14px" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--neutral-400)" }} />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--neutral-400)" }} />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--neutral-400)" }} />
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-neutral-200" style={{ background: "white" }}>
        <div className="flex-1 rounded-lg px-3 py-2" style={{ background: "var(--neutral-100)", fontSize: "12px", color: "var(--neutral-400)" }}>
          Ask about your plan...
        </div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--teal)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ── FinancialsMockup ─────────────────────────────────────────────────────── */

function FinancialsMockup() {
  return (
    <div className="p-4" style={{ background: "var(--neutral-50)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>Financials</p>
        <span style={{ color: "var(--sage)", fontSize: "10px", fontWeight: 600 }}>67%</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: "Startup cost", value: "$142,500" },
          { label: "Monthly rent", value: "$4,200" },
          { label: "Break-even", value: "Month 14" },
          { label: "Year 1 revenue", value: "$328k" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg p-2.5 border" style={{ background: "white", borderColor: "var(--border-subtle)" }}>
            <p style={{ color: "var(--neutral-500)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>{s.label}</p>
            <p style={{ color: "var(--teal)", fontSize: "14px", fontWeight: 700, lineHeight: 1 }}>{s.value}</p>
          </div>
        ))}
      </div>
      {/* Benchmark */}
      <div className="rounded-lg px-3 py-2 mb-2 flex items-center gap-2" style={{ background: "rgba(118,179,157,0.1)", border: "1px solid rgba(118,179,157,0.2)" }}>
        <div className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--sage)" }}>
          <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p style={{ color: "var(--teal)", fontSize: "10px", fontWeight: 500 }}>Startup cost within healthy range</p>
      </div>
      <div className="rounded-lg p-3" style={{ background: "white", border: "1px solid var(--border-subtle)" }}>
        <p style={{ color: "var(--neutral-500)", fontSize: "9px", marginBottom: "6px" }}>12-month projection</p>
        <div className="flex items-end gap-1 h-8">
          {[20, 35, 45, 55, 60, 68, 75, 82, 88, 90, 95, 100].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i < 6 ? "var(--border-subtle)" : "var(--sage)", opacity: i < 6 ? 0.6 : 1 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── MenuMockup ───────────────────────────────────────────────────────────── */

function MenuMockup() {
  const items = [
    { name: "Espresso", cost: "$0.48", price: "$3.50", margin: "86%" },
    { name: "Oat Latte", cost: "$1.12", price: "$6.00", margin: "81%" },
    { name: "Cold Brew", cost: "$0.85", price: "$5.50", margin: "85%" },
    { name: "Matcha Latte", cost: "$1.45", price: "$6.50", margin: "78%" },
  ];
  return (
    <div className="p-4" style={{ background: "var(--neutral-50)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>Menu Pricing</p>
        <span className="rounded px-2 py-0.5" style={{ background: "rgba(118,179,157,0.12)", color: "var(--sage)", fontSize: "10px", fontWeight: 600 }}>4 items</span>
      </div>
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="grid grid-cols-4 px-3 py-1.5" style={{ background: "var(--warm-surface)" }}>
          {["Item", "Cost", "Price", "Margin"].map((h) => (
            <p key={h} style={{ fontSize: "9px", color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</p>
          ))}
        </div>
        {items.map((item, i) => (
          <div key={item.name} className="grid grid-cols-4 px-3 py-2" style={{ background: "white", borderTop: i > 0 ? "1px solid var(--warm-surface)" : "none" }}>
            <p style={{ fontSize: "11px", color: "var(--teal)", fontWeight: 500 }}>{item.name}</p>
            <p style={{ fontSize: "11px", color: "var(--neutral-500)" }}>{item.cost}</p>
            <p style={{ fontSize: "11px", color: "var(--neutral-700)" }}>{item.price}</p>
            <p style={{ fontSize: "11px", color: "var(--sage)", fontWeight: 600 }}>{item.margin}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── LaunchMockup ─────────────────────────────────────────────────────────── */

function LaunchMockup() {
  const milestones = [
    { label: "Lease signed", done: true, date: "Mar 1" },
    { label: "Permits filed", done: true, date: "Mar 15" },
    { label: "Equipment ordered", done: true, date: "Apr 1" },
    { label: "Staff hired", done: false, date: "May 1", next: true },
    { label: "Soft open", done: false, date: "Jun 1" },
    { label: "Grand opening", done: false, date: "Jun 15" },
  ];
  return (
    <div className="p-4" style={{ background: "var(--neutral-50)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>Launch Plan</p>
        <span style={{ color: "var(--sage)", fontSize: "10px", fontWeight: 600 }}>3 of 6 done</span>
      </div>
      <div className="space-y-1.5">
        {milestones.map((m) => (
          <div
            key={m.label}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2"
            style={{
              background: m.next ? "rgba(118,179,157,0.08)" : "white",
              border: m.next ? "1px solid rgba(118,179,157,0.25)" : "1px solid var(--warm-surface)",
            }}
          >
            <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: m.done ? "var(--sage)" : "var(--border-subtle)" }}>
              {m.done && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </div>
            <p style={{ fontSize: "11px", color: m.done ? "var(--neutral-500)" : m.next ? "var(--teal)" : "var(--neutral-700)", textDecoration: m.done ? "line-through" : "none", flex: 1, fontWeight: m.next ? 600 : 400 }}>
              {m.label}
              {m.next && <span style={{ color: "var(--sage)", fontSize: "10px", fontWeight: 500, marginLeft: "4px" }}>← next</span>}
            </p>
            <p style={{ fontSize: "10px", color: "var(--neutral-400)", flexShrink: 0 }}>{m.date}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

