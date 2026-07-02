import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CookiePreferencesLink } from "@/components/consent/CookiePreferencesLink";
import HomeNav from "../_components/HomeNav";
import { Logo } from "../_components/Logo";
import HomepageHero from "../_components/HomepageHero";
import {
  SessionExpiredBanner,
  isSessionExpiredFlag,
} from "../_components/SessionExpiredBanner";
import FeatureAccordion, { type AccordionItem } from "../_components/FeatureAccordion";
import BenefitSections from "../_components/BenefitSections";
import {
  FadeUp,
  ScaleIn,
  StaggerContainer,
  StaggerItem,
} from "../_components/AnimatedElements";
import ModuleCard from "../_components/ModuleCard";
import { AIChatMockup, FinancialsMockup, MenuMockup, LaunchMockup } from "../_components/Mockups";
import PricingSection from "../_components/PricingSection";

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
      "Coffee Concept, Location & Lease, Menu Pricing, Build-Out & Equipment, Barista Hiring, Financials, Operations Playbook, Launch Plan: eight modules in sequence",
      "Asks for the inputs that matter, skips the ones that don't",
      "Saves your answers and shows what's left",
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
    title: "Ready For Opening Day",
    oneLiner:
      "Goes past pre-open paperwork through opening day.",
    bullets: [
      "Hiring plan with roles, descriptions and labor cost before week one",
      "Menu pricing and recipe costing you can update as suppliers change",
      "Operations playbook and launch checklist tied to your milestones",
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
    body: "Coffee Concept, Location & Lease, Menu Pricing, Build-Out & Equipment, Barista Hiring, Financials, Operations Playbook, and Launch Plan are all wired to the same source of truth, so updates in one module flow through the rest.",
  },
  {
    eyebrow: "Financial Model",
    title: "Stress-Test Lease and Pricing Scenarios",
    body: "Adjust rent, opening date, ticket size, or daily transactions and the projection refreshes immediately. Outputs are planning estimates only; review with a licensed accountant before signing.",
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
      { label: "Help & Support", href: "/help" },
      { label: "hello@timberline.coffee", href: "mailto:hello@timberline.coffee" },
    ],
  },
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams?: Promise<{ expired?: string }>;
}) {
  // TIM-2732: render the shared session-expiry banner above the nav when the
  // visitor was bounced here with `?expired=1`. Today (app)/layout.tsx and
  // src/proxy.ts redirect to /login; this keeps the banner symmetric on
  // /landing so any future entry path (or a hand-shared deep link) reads the
  // same way visually.
  const { expired } = (await searchParams) ?? {};
  const sessionExpired = isSessionExpiredFlag(expired);
  return (
    <main className="flex flex-col">
      {sessionExpired && (
        <div className="bg-white border-b border-neutral-200 px-4 py-3">
          <div className="max-w-5xl mx-auto">
            <SessionExpiredBanner />
          </div>
        </div>
      )}
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
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                title: "Guided Through Every Decision",
                body: "Eight modules in order. You always know what to plan next.",
              },
              {
                title: "Scout in Your Corner",
                body: "Ask about your lease, menu, or equipment. Get answers tied to your plan.",
              },
            ].map((item) => (
              <StaggerItem key={item.title}>
                <div>
                  <p
                    className="font-semibold mb-2"
                    style={{
                      fontSize: "17px",
                      color: "var(--teal)",
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
                description="Startup costs and 12-month projections, all in one place."
                mockup={<FinancialsMockup />}
                thumbnailSrc="https://images.pexels.com/photos/4350048/pexels-photo-4350048.jpeg?auto=compress&cs=tinysrgb&w=600&h=280&dpr=1"
                thumbnailAlt="Coffee shop owner reviewing financial spreadsheets"
              />
            </StaggerItem>
            <StaggerItem className="h-full">
              <ModuleCard
                title="Menu Pricing"
                description="Cost-per-cup analysis with margin targets and local cafe price research."
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
        <PricingSection />
        <div className="max-w-6xl mx-auto">
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
                &copy; {new Date().getFullYear()} Ivy &amp; Rill Consulting Inc. All rights reserved.
              </p>
              <p style={{ color: "var(--neutral-600)", fontSize: "13px" }}>
                Groundwork is a product of Ivy &amp; Rill Consulting Inc.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

