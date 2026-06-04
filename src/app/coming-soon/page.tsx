import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/app/_components/Logo";
import { CookiePreferencesLink } from "@/components/consent/CookiePreferencesLink";
import {
  FadeUp,
  ScaleIn,
  StaggerContainer,
  StaggerItem,
} from "@/app/_components/AnimatedElements";
import ModuleCard from "@/app/_components/ModuleCard";
import {
  AIChatMockup,
  FinancialsMockup,
  MenuMockup,
  LaunchMockup,
} from "@/app/_components/Mockups";
import { WaitlistForm } from "./WaitlistForm";

// TIM-2285 v2: rebuilt to match landing-page design quality per board feedback
// (Trent 2026-06-04). Reuses the exact landing-page vocabulary — the same
// hero gradient (#0c3a3d → #155e63 → #1a7880), animation primitives,
// product mockups (AIChatMockup / FinancialsMockup / MenuMockup /
// LaunchMockup), ModuleCard shell, Pexels photography, founder pull
// quote, eyebrow/headline rhythm, and CTA gradient break.
//
// Style guide TIM-1537. No new design system work; every visual
// component on this page is already in production on src/app/page.tsx.

// Pexels photos by Ketut Subiyanto (Pexels License — free for commercial use).
// Same images the landing page uses.
const PEXELS = {
  teamPlanning:
    "https://images.pexels.com/photos/4350093/pexels-photo-4350093.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1",
  baristaMilk:
    "https://images.pexels.com/photos/4350048/pexels-photo-4350048.jpeg?auto=compress&cs=tinysrgb&w=1100&h=700&dpr=1",
  ownersCollab:
    "https://images.pexels.com/photos/4350061/pexels-photo-4350061.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1",
  // Thumbnail tiles for the ModuleCard strip
  espressoMachine:
    "https://images.pexels.com/photos/4350048/pexels-photo-4350048.jpeg?auto=compress&cs=tinysrgb&w=600&h=280&dpr=1",
  menuBoard:
    "https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=600&h=280&dpr=1",
  teamLaunch:
    "https://images.pexels.com/photos/4350093/pexels-photo-4350093.jpeg?auto=compress&cs=tinysrgb&w=600&h=280&dpr=1",
};

export const metadata: Metadata = {
  title: "Groundwork.AI — Almost Here. Join the Waitlist.",
  description:
    "Groundwork.AI is almost here. Join the waitlist and lock in your exclusive launch price, permanently below public plans.",
  openGraph: {
    title: "Groundwork.AI — Almost Here. Join the Waitlist.",
    description:
      "Join the waitlist and lock in your exclusive launch price, permanently below public plans.",
    siteName: "Groundwork",
  },
  robots: { index: false, follow: false },
};

const VALUE_PROPS = [
  {
    accent: "sage" as const,
    title: "Locked-In Launch Price",
    body: "Waitlist members get a launch price permanently below public Starter and Pro plans.",
  },
  {
    accent: "teal" as const,
    title: "First Through the Door",
    body: "Skip the public queue. Onboard the day Groundwork.AI opens, before pricing tiers fill.",
  },
  {
    accent: "sage" as const,
    title: "Built for Real Owners",
    body: "Everything you see below is shipped today — no roadmap claims, no landing-page fiction.",
  },
];

const EIGHT_MODULES = [
  { label: "Concept" },
  { label: "Location & Lease" },
  { label: "Menu Pricing" },
  { label: "Build-Out & Equipment" },
  { label: "Hiring" },
  { label: "Financials" },
  { label: "Operations Playbook" },
  { label: "Launch Plan" },
];

const FOUNDER_QUOTE = {
  body: "Most people who open a coffee shop don't have a business background. Build your plan thoughtfully, even without one. Groundwork.AI fills the gaps so you can plan your shop intentionally.",
  attribution: "Trent Rollings",
  role: "Founder, Timberline Coffee School",
};

export default function ComingSoonPage() {
  return (
    <main className="flex flex-col">
      {/* ── Top bar (white-on-dark, no sign-in CTA pre-launch) ───────────────── */}
      <header className="absolute top-0 left-0 right-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/coming-soon" className="flex items-center" aria-label="Groundwork.AI home">
            <Logo variant="white" height={40} priority />
          </Link>
          <span
            className="font-semibold uppercase"
            style={{
              fontSize: "11px",
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Coming Soon
          </span>
        </div>
      </header>

      {/* ── Hero — same gradient + 2-col rhythm as HomepageHero ──────────────── */}
      <section
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{
          background:
            "linear-gradient(130deg, #0c3a3d 0%, #155e63 55%, #1a7880 100%)",
        }}
      >
        {/* Soft dot grid + sage radial — borrowed from the landing-page CTA */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            top: "-120px",
            right: "-120px",
            width: "520px",
            height: "520px",
            background: "radial-gradient(circle, rgba(118,179,157,0.18) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 max-w-6xl mx-auto w-full px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          {/* Left — eyebrow + headline + promise + waitlist form */}
          <div>
            <FadeUp>
              <p
                className="font-semibold uppercase mb-4"
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  color: "var(--sage)",
                }}
              >
                Groundwork.AI &mdash; Waitlist Open
              </p>
            </FadeUp>
            <FadeUp delay={0.08}>
              <h1
                className="font-bold text-white mb-5"
                style={{
                  fontSize: "clamp(1.875rem, 5.5vw, 3.75rem)",
                  lineHeight: 1.07,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  textWrap: "balance",
                }}
              >
                Groundwork.AI is{" "}
                <span style={{ color: "var(--sage)" }}>almost here.</span>
              </h1>
            </FadeUp>
            <FadeUp delay={0.18}>
              <p
                className="mb-8 text-white"
                style={{
                  fontSize: "1.1875rem",
                  lineHeight: 1.6,
                  opacity: 0.86,
                  fontWeight: 400,
                  maxWidth: "480px",
                }}
              >
                Join the waitlist and lock in your exclusive launch price,
                permanently below public plans.
              </p>
            </FadeUp>
            <FadeUp delay={0.28}>
              <WaitlistForm />
            </FadeUp>

            {/* Trust strip */}
            <FadeUp delay={0.4}>
              <ul className="mt-8 space-y-2.5" aria-label="What waitlist members get">
                {[
                  "Locked-in launch price, permanently below public plans",
                  "Onboard the day Groundwork.AI opens — no public queue",
                  "Every feature below is live in the platform today",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <span
                      className="flex-shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: "18px",
                        height: "18px",
                        background: "rgba(118,179,157,0.22)",
                        marginTop: "2px",
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--sage)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <p
                      className="text-white"
                      style={{ fontSize: "14px", lineHeight: 1.45, opacity: 0.84 }}
                    >
                      {feature}
                    </p>
                  </li>
                ))}
              </ul>
            </FadeUp>
          </div>

          {/* Right — Scout chat mockup with floating benchmark card */}
          <ScaleIn delay={0.18} className="relative">
            <AIChatMockup />
            <div
              className="absolute -bottom-5 -left-4 rounded-xl px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.96)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(118,179,157,0.3)",
                boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: "var(--sage)" }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>
                  Waitlist members lock in launch pricing
                </p>
              </div>
            </div>
          </ScaleIn>
        </div>

        {/* Scroll indicator (matches HomepageHero) */}
        <div
          className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1"
          aria-hidden="true"
        >
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "20px" }}>↓</span>
        </div>
      </section>

      {/* ── Value-props strip (white) ────────────────────────────────────────── */}
      <section className="bg-white border-b border-neutral-200" style={{ padding: "56px 24px" }}>
        <div className="max-w-5xl mx-auto">
          <FadeUp>
            <p
              className="text-center font-semibold uppercase mb-10"
              style={{ fontSize: "11px", letterSpacing: "0.14em", color: "var(--sage)" }}
            >
              Why Join the Waitlist
            </p>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {VALUE_PROPS.map((item) => (
              <StaggerItem key={item.title}>
                <div>
                  <p
                    className="font-semibold mb-2"
                    style={{
                      fontSize: "17px",
                      color: item.accent === "sage" ? "var(--sage)" : "var(--teal)",
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

      {/* ── Real Tools, Shipped Today — ModuleCard grid ──────────────────────── */}
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
              Real Tools, Shipped Today
            </h2>
            <p
              className="mx-auto mt-4 text-neutral-600"
              style={{ fontSize: "17px", lineHeight: 1.55, maxWidth: "560px" }}
            >
              Every module below is live in the platform right now. Waitlist members get in
              first, at the lowest price.
            </p>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StaggerItem className="h-full">
              <ModuleCard
                title="Financials"
                description="Startup costs and 12-month projections, benchmarked live."
                mockup={<FinancialsMockup />}
                thumbnailSrc={PEXELS.espressoMachine}
                thumbnailAlt="Coffee shop owner reviewing financial spreadsheets"
              />
            </StaggerItem>
            <StaggerItem className="h-full">
              <ModuleCard
                title="Menu Pricing"
                description="Cost-per-cup analysis with margin targets and industry benchmarks."
                mockup={<MenuMockup />}
                thumbnailSrc={PEXELS.menuBoard}
                thumbnailAlt="Barista preparing espresso drinks at a coffee bar"
              />
            </StaggerItem>
            <StaggerItem className="h-full">
              <ModuleCard
                title="Launch Plan"
                description="Milestone-based plan tied to your open date, with next actions always visible."
                mockup={<LaunchMockup />}
                thumbnailSrc={PEXELS.teamLaunch}
                thumbnailAlt="Coffee shop team reviewing their launch plan together"
              />
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ── Scout AI assistant — 2-col with chat mockup ──────────────────────── */}
      <section className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
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
                A Coffee-Specific AI, Not Generic Small-Business Advice
              </h2>
              <p className="text-neutral-600 mb-8 leading-relaxed" style={{ fontSize: "1.0625rem" }}>
                Ask about your lease terms, equipment list, menu costs, or opening
                timeline. Scout reads your plan and answers in coffee terms — the
                vocabulary an operator actually uses.
              </p>
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "Coffee-Specific Guidance", color: "sage" as const },
                  { label: "Tied to Your Plan", color: "teal" as const },
                  { label: "Benchmarked, Not Vibes", color: "sage" as const },
                ].map((tag) => (
                  <span
                    key={tag.label}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{
                      background:
                        tag.color === "sage" ? "rgba(118,179,157,0.12)" : "rgba(21,94,99,0.08)",
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
                AI responses are planning support, not professional advice. Verify any
                financial, legal, or regulatory output with a licensed advisor before
                acting on it.
              </p>
            </FadeUp>

            <ScaleIn delay={0.12}>
              <AIChatMockup />
            </ScaleIn>
          </div>
        </div>
      </section>

      {/* ── Eight modules strip — sage-tint background, with photo ───────────── */}
      <section
        style={{
          background: "rgba(118,179,157,0.06)",
          padding: "96px 24px",
          borderTop: "1px solid rgba(118,179,157,0.15)",
          borderBottom: "1px solid rgba(118,179,157,0.15)",
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            <ScaleIn className="lg:col-span-2 relative">
              <div className="rounded-2xl overflow-hidden aspect-[4/5] relative">
                <Image
                  src={PEXELS.ownersCollab}
                  alt="Coffee shop owners collaborating on their plan together. Photo: Ketut Subiyanto / Pexels."
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
                <p
                  className="font-semibold uppercase mb-1"
                  style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--sage)" }}
                >
                  Eight modules, one plan
                </p>
                <p style={{ fontSize: "12px", color: "var(--teal)", fontWeight: 600 }}>
                  Sequenced the way owners actually decide
                </p>
              </div>
            </ScaleIn>

            <div className="lg:col-span-3">
              <FadeUp>
                <p
                  className="font-semibold uppercase mb-3"
                  style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--sage)" }}
                >
                  Eight-Module Planning Suite
                </p>
                <h2
                  className="font-bold mb-4"
                  style={{
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    lineHeight: 1.22,
                    fontWeight: 700,
                    color: "var(--teal)",
                  }}
                >
                  Every Module a Lender Expects
                </h2>
                <p className="text-neutral-600 mb-7 leading-relaxed" style={{ fontSize: "1.0625rem" }}>
                  Concept, location, menu, equipment, hiring, financials, operations,
                  and launch — wired to the same source of truth so updates in one
                  module flow through the rest.
                </p>
              </FadeUp>
              <StaggerContainer className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {EIGHT_MODULES.map((m, i) => (
                  <StaggerItem key={m.label}>
                    <div
                      className="rounded-lg px-3 py-3 flex items-center gap-2.5 h-full"
                      style={{
                        background: "white",
                        border: "1px solid var(--border-subtle, rgba(0,0,0,0.08))",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      }}
                    >
                      <span
                        className="font-semibold flex items-center justify-center rounded-md flex-shrink-0"
                        style={{
                          width: "24px",
                          height: "24px",
                          background: i % 2 === 0 ? "rgba(21,94,99,0.08)" : "rgba(118,179,157,0.12)",
                          color: i % 2 === 0 ? "var(--teal)" : "var(--sage)",
                          fontSize: "11px",
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 500,
                          color: "var(--teal)",
                          lineHeight: 1.25,
                        }}
                      >
                        {m.label}
                      </span>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </div>
          </div>
        </div>
      </section>

      {/* ── Founder pull quote + barista photo (mirrors landing page) ────────── */}
      <section className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
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

      {/* ── Final CTA — gradient break, mirrors landing page CTA break ───────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(130deg, var(--teal-darkest, #0c3a3d) 0%, var(--teal) 55%, var(--teal-bright, #1a7880) 100%)",
          padding: "96px 24px",
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
        <div
          className="absolute pointer-events-none"
          style={{
            top: "-100px",
            right: "-80px",
            width: "400px",
            height: "400px",
            background: "radial-gradient(circle, rgba(118,179,157,0.18) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <FadeUp>
            <p
              className="font-semibold uppercase mb-4"
              style={{
                fontSize: "11px",
                letterSpacing: "0.16em",
                color: "var(--sage)",
              }}
            >
              Lock In Your Launch Price
            </p>
            <h2
              className="text-white font-bold mb-5"
              style={{
                fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
                lineHeight: 1.2,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              Be First Through the Door
            </h2>
            <p
              className="mx-auto mb-10"
              style={{
                color: "rgba(255,255,255,0.82)",
                fontSize: "1.0625rem",
                lineHeight: 1.6,
                maxWidth: "540px",
              }}
            >
              Drop your email. We&rsquo;ll send one note when Groundwork.AI opens, with
              your locked-in price.
            </p>
          </FadeUp>
          <FadeUp delay={0.12}>
            <div className="max-w-xl mx-auto text-left">
              <WaitlistForm />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── Footer (dark, mirrors landing-page footer rhythm) ────────────────── */}
      <footer
        style={{
          background: "var(--neutral-900, #18181B)",
          padding: "48px 24px 32px",
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <Logo variant="white" height={28} />
          </div>
          <div
            className="border-t pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
              &copy; {new Date().getFullYear()} Timberline Coffee School. Groundwork.AI is a product of Timberline Coffee School.
            </p>
            <nav className="flex items-center gap-5" aria-label="Footer">
              <Link
                href="/privacy"
                style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}
                className="hover:text-white"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}
                className="hover:text-white"
              >
                Terms
              </Link>
              <a
                href="mailto:hello@timberline.coffee"
                style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}
                className="hover:text-white"
              >
                Contact
              </a>
              <CookiePreferencesLink
                className="hover:text-white"
                style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}
              />
            </nav>
          </div>
        </div>
      </footer>
    </main>
  );
}
