import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import HomeNav from "./_components/HomeNav";
import HomepageHero from "./_components/HomepageHero";
import {
  FadeUp,
  FadeIn,
  ScaleIn,
  StaggerContainer,
  StaggerItem,
  AnimatedCounter,
} from "./_components/AnimatedElements";

export const metadata: Metadata = {
  title: "Groundwork: Plan your coffee shop, start to open.",
  description:
    "A planning tool for people serious about opening a coffee shop. Eight modules. Startup cost estimates. A financial model that updates as your plan does.",
  openGraph: {
    title: "Groundwork: Plan your coffee shop, start to open.",
    description:
      "A planning tool for people serious about opening a coffee shop.",
    siteName: "Groundwork",
  },
};

// Pexels photos by Ketut Subiyanto (Pexels License — free for commercial use)
const PEXELS = {
  baristaSmiling:
    "https://images.pexels.com/photos/4349736/pexels-photo-4349736.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1",
  baristaBeard:
    "https://images.pexels.com/photos/5553518/pexels-photo-5553518.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1",
  cafeMachine:
    "https://images.pexels.com/photos/12859353/pexels-photo-12859353.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1",
};

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    title: "Eight guided modules",
    body: "From concept and financials through build-out, menu, marketing, and launch: every decision gets its own planning tool.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>
      </svg>
    ),
    title: "Live financial model",
    body: "Your startup cost estimate and 12-month projection update as you fill in your actual lease terms, equipment, and staffing.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "AI coach, coffee specific",
    body: "Ask about your plan and get answers from a coach who has been in specialty coffee for fifteen years. Not general business advice.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
    title: "Export as PDF",
    body: "Every module produces a document. All eight combine into your Business Readiness Document: a real plan for lenders and partners.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    ),
    title: "Progress tracking",
    body: "See exactly where you are across all eight modules. Pick up where you left off, on your phone, laptop, or tablet.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Built by someone who opened shops",
    body: "Trent Rollings is a World Coffee Championships judge and SCA Authorized Trainer who has personally opened and closed coffee businesses.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I had a business plan from a consultant that cost me $8,000. Groundwork found three gaps that plan missed, and I hadn't paid a subscription yet.",
    name: "Daniela Reyes",
    city: "Portland, OR",
    initial: "D",
  },
  {
    quote:
      "The financial model updated every time I changed my lease terms. I went into negotiations knowing exactly what I could afford.",
    name: "James Okafor",
    city: "Chicago, IL",
    initial: "J",
  },
  {
    quote:
      "I've been in coffee for twelve years. I still learned things I didn't know I didn't know.",
    name: "Sarah Kim",
    city: "Seattle, WA",
    initial: "S",
  },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "",
    note: "No credit card required",
    features: [
      "Complete onboarding questionnaire",
      "Access your dashboard",
      "Preview Module 1 content",
      "See your full plan outline",
    ],
    cta: "Start for free",
    href: "/login",
    recommended: false,
    accent: false,
  },
  {
    name: "Builder",
    price: "$49",
    period: "/month",
    note: "$39/mo billed annually",
    features: [
      "Full access to all 8 modules",
      "Startup cost estimator",
      "12-month financial model",
      "Export plan as PDF",
      "50 AI coach sessions per month",
      "Email support",
    ],
    cta: "Start your plan",
    href: "/login?plan=builder",
    recommended: false,
    accent: false,
  },
  {
    name: "Accelerator",
    price: "$99",
    period: "/month",
    note: "$79/mo billed annually",
    features: [
      "Everything in Builder",
      "Unlimited AI coaching",
      "Weekly async Q&A with Trent",
      "Financial model stress-testing",
      "Equipment sourcing help",
      "30-min call with Trent at plan completion",
      "Priority support",
    ],
    cta: "Get the full plan",
    href: "/login?plan=accelerator",
    recommended: true,
    accent: true,
  },
];

const FOOTER_COLS = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
      { label: "Sign in", href: "/login" },
      { label: "Start your plan", href: "/login?plan=builder" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About Trent", href: "#about" },
      { label: "Timberline Coffee School", href: "https://timberline.coffee" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of use", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Subscription terms", href: "/subscription-terms" },
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

      {/* ── Social proof / stats bar ──────────────────────────────────────────
          Animated counters on scroll. White bg, simple divider layout.
      ─────────────────────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-neutral-200" style={{ padding: "48px 24px" }}>
        <div className="max-w-4xl mx-auto">
          <FadeUp>
            <p className="text-center text-neutral-500 text-sm mb-10 font-medium">
              Built by a World Coffee Championships judge. Everything from concept through launch in one place.
            </p>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { target: 1200, suffix: "+", label: "Plans started", prefix: "" },
              { target: 8, suffix: "", label: "Planning modules", prefix: "" },
              { target: 15, suffix: "+", label: "Years in specialty coffee", prefix: "" },
            ].map((s) => (
              <StaggerItem key={s.label}>
                <div>
                  <p
                    className="font-bold"
                    style={{ fontSize: "40px", lineHeight: 1, color: "#155e63", letterSpacing: "-0.02em" }}
                  >
                    <AnimatedCounter target={s.target} prefix={s.prefix} suffix={s.suffix} />
                  </p>
                  <p className="text-neutral-500 mt-1" style={{ fontSize: "14px" }}>
                    {s.label}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────
          Staggered card entrance. Neutral-50 bg.
      ─────────────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-14">
            <p
              className="font-semibold uppercase mb-3 text-teal"
              style={{ fontSize: "11px", letterSpacing: "0.12em" }}
            >
              What&apos;s included
            </p>
            <h2
              className="font-bold text-neutral-950"
              style={{
                fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
                lineHeight: 1.2,
                fontWeight: 700,
              }}
            >
              Eight sections. Everything a new coffee shop needs.
            </h2>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <div
                  className="bg-white rounded-xl p-6 border border-neutral-200 hover:border-teal/40 hover:-translate-y-1 transition-all duration-200 cursor-default h-full"
                  style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-teal mb-4"
                    style={{ background: "rgba(21,94,99,0.08)" }}
                  >
                    {f.icon}
                  </div>
                  <h3 className="font-semibold text-neutral-950 mb-2" style={{ fontSize: "15px" }}>
                    {f.title}
                  </h3>
                  <p className="text-neutral-600 leading-relaxed" style={{ fontSize: "14px" }}>
                    {f.body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ── Value props — contained photo + numbered list ─────────────────────
          Photo on the left in a rounded frame (not full-bleed). Text on right.
      ─────────────────────────────────────────────────────────────────────── */}
      <section className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            {/* Contained photo — 3 cols */}
            <ScaleIn className="lg:col-span-3 relative">
              <div className="rounded-2xl overflow-hidden aspect-[4/3] relative">
                <Image
                  src={PEXELS.baristaSmiling}
                  alt="Barista serving coffee in a specialty cafe"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 60vw"
                />
                {/* Subtle inner shadow overlay for depth */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom right, transparent 50%, rgba(14,68,72,0.15) 100%)",
                  }}
                />
              </div>
              {/* Floating stat card */}
              <div
                className="absolute bottom-4 left-4 rounded-xl px-4 py-3"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(21,94,99,0.12)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                }}
              >
                <p className="font-bold" style={{ fontSize: "22px", lineHeight: 1, color: "#155e63" }}>
                  8
                </p>
                <p className="text-neutral-600 mt-0.5" style={{ fontSize: "12px" }}>
                  planning modules
                </p>
              </div>
            </ScaleIn>

            {/* Cards right — 2 cols */}
            <div className="lg:col-span-2 space-y-4">
              <FadeUp>
                <p
                  className="font-semibold uppercase text-teal mb-2"
                  style={{ fontSize: "11px", letterSpacing: "0.12em" }}
                >
                  A plan, not just advice
                </p>
                <h2
                  className="font-bold text-neutral-950 mb-6"
                  style={{
                    fontSize: "clamp(1.4rem, 3vw, 1.875rem)",
                    lineHeight: 1.25,
                    fontWeight: 700,
                  }}
                >
                  You leave with documents, not notes.
                </h2>
              </FadeUp>
              <StaggerContainer>
                {[
                  {
                    num: "01",
                    title: "Startup cost estimate",
                    body: "Built from your specific lease, equipment, and staffing decisions.",
                  },
                  {
                    num: "02",
                    title: "12-month financial model",
                    body: "Updates as your plan changes. Know your break-even before you sign a lease.",
                  },
                  {
                    num: "03",
                    title: "Launch checklist",
                    body: "Tied to your actual timeline. Nothing generic.",
                  },
                ].map((item) => (
                  <StaggerItem key={item.num}>
                    <div
                      className="flex gap-4 p-4 rounded-xl border border-neutral-200 bg-neutral-50 hover:border-teal/30 transition-colors"
                    >
                      <span
                        className="font-bold flex-shrink-0"
                        style={{ fontSize: "13px", color: "#155e63", opacity: 0.5, marginTop: "2px" }}
                      >
                        {item.num}
                      </span>
                      <div>
                        <p
                          className="font-semibold text-neutral-950 mb-0.5"
                          style={{ fontSize: "14px" }}
                        >
                          {item.title}
                        </p>
                        <p className="text-neutral-600" style={{ fontSize: "13px", lineHeight: 1.5 }}>
                          {item.body}
                        </p>
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerContainer>
              <FadeUp delay={0.3}>
                <Link
                  href="/login?plan=builder"
                  className="inline-flex items-center justify-center w-full px-6 py-3 rounded-lg font-semibold text-sm text-white transition-all mt-2"
                  style={{ background: "var(--teal)" }}
                >
                  Start your plan &rarr;
                </Link>
              </FadeUp>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────────────
          White cards on neutral-50 bg. Lora italic quotes. Stagger on scroll.
      ─────────────────────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-12">
            <p
              className="font-semibold uppercase mb-3 text-teal"
              style={{ fontSize: "11px", letterSpacing: "0.12em" }}
            >
              From people who used it
            </p>
            <h2
              className="font-bold text-neutral-950"
              style={{ fontSize: "clamp(1.5rem, 3.5vw, 2rem)", lineHeight: 1.25, fontWeight: 700 }}
            >
              Built for the part where you don&apos;t know what you don&apos;t know.
            </h2>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <StaggerItem key={t.name}>
                <div
                  className="bg-white rounded-xl p-6 border border-neutral-200 hover:border-teal/30 hover:-translate-y-1 transition-all duration-200 h-full flex flex-col"
                  style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                >
                  {/* Teal accent bar */}
                  <div className="w-8 h-0.5 mb-5" style={{ background: "var(--teal)" }} />
                  <blockquote
                    className="text-neutral-700 leading-relaxed mb-5 flex-1"
                    style={{
                      fontFamily: "var(--font-lora, Georgia), serif",
                      fontStyle: "italic",
                      fontSize: "1rem",
                      lineHeight: "1.75",
                    }}
                  >
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div className="flex items-center gap-3 mt-auto">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0"
                      style={{ background: "var(--teal)", fontSize: "13px" }}
                    >
                      {t.initial}
                    </div>
                    <div>
                      <p className="font-semibold text-neutral-950" style={{ fontSize: "13px" }}>
                        {t.name}
                      </p>
                      <p className="text-neutral-500" style={{ fontSize: "12px", marginTop: "1px" }}>
                        {t.city}
                      </p>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* ── CTA break — gradient, no full-bleed photo ─────────────────────────
          Clean teal gradient with noise texture. Premium feel.
      ─────────────────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(130deg, #0c3a3d 0%, #155e63 55%, #1a7880 100%)",
          padding: "88px 24px",
        }}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative z-10 max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-8">
          <FadeUp>
            <h2
              className="text-white font-bold mb-2"
              style={{
                fontSize: "clamp(1.4rem, 3vw, 1.875rem)",
                lineHeight: 1.2,
                fontWeight: 700,
                maxWidth: "480px",
              }}
            >
              Most people who open coffee shops don&apos;t have a business background.
            </h2>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "1rem", lineHeight: 1.65 }}>
              Groundwork doesn&apos;t assume you do.
            </p>
          </FadeUp>
          <FadeUp delay={0.15}>
            <Link
              href="/login?plan=builder"
              className="flex-shrink-0 inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-semibold text-sm transition-all"
              style={{
                background: "white",
                color: "#155e63",
                boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              }}
            >
              Start your plan
            </Link>
          </FadeUp>
        </div>
      </section>

      {/* ── Pricing — vertical 3-column cards ─────────────────────────────────
          Standard SaaS layout. Accelerator center + teal bg.
      ─────────────────────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-14">
            <p
              className="font-semibold uppercase mb-3 text-teal"
              style={{ fontSize: "11px", letterSpacing: "0.12em" }}
            >
              Pricing
            </p>
            <h2
              className="font-bold text-neutral-950"
              style={{
                fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
                lineHeight: 1.2,
                fontWeight: 700,
              }}
            >
              Start free. Go deeper when you&apos;re ready.
            </h2>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {PRICING.map((plan) => (
              <StaggerItem key={plan.name}>
                <PricingCard plan={plan} />
              </StaggerItem>
            ))}
          </StaggerContainer>
          <FadeUp delay={0.3}>
            <p className="text-center text-neutral-500 mt-8" style={{ fontSize: "13px" }}>
              All plans include access to the planning framework. Free plan has no time limit.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* ── About ─────────────────────────────────────────────────────────────
          Contained photo on left. Text on right. Neutral-50 bg.
      ─────────────────────────────────────────────────────────────────────── */}
      <section id="about" style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <ScaleIn className="relative">
              <div className="rounded-2xl overflow-hidden aspect-[4/3] relative">
                <Image
                  src={PEXELS.cafeMachine}
                  alt="Barista at a modern espresso machine in a specialty cafe"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
            </ScaleIn>
            <div>
              <FadeUp>
                <p
                  className="font-semibold uppercase mb-4 text-teal"
                  style={{ fontSize: "11px", letterSpacing: "0.12em" }}
                >
                  Who built this
                </p>
                <h2
                  className="font-bold text-neutral-950 mb-5"
                  style={{
                    fontSize: "clamp(1.4rem, 3vw, 1.875rem)",
                    lineHeight: 1.25,
                    fontWeight: 700,
                  }}
                >
                  Built by someone who&apos;s been there.
                </h2>
                <p className="text-neutral-700 mb-4 leading-relaxed" style={{ fontSize: "1rem" }}>
                  Trent Rollings is a World Coffee Championships judge, SCA Authorized Specialty
                  Trainer, and the founder of Timberline Coffee School.
                </p>
                <p className="text-neutral-700 mb-8 leading-relaxed" style={{ fontSize: "1rem" }}>
                  He spent years teaching the Coffee Shop Basecamp curriculum to aspiring owners and
                  has personally opened and closed coffee businesses. This platform is everything he
                  teaches in live cohorts, at a fraction of the consulting cost.
                </p>
                <Link
                  href="/login?plan=builder"
                  className="inline-flex items-center justify-center px-7 py-3 rounded-lg font-semibold text-sm text-white transition-all"
                  style={{ background: "var(--teal)" }}
                >
                  Start your plan for free
                </Link>
              </FadeUp>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer style={{ background: "var(--neutral-900)", padding: "64px 24px 40px" }}>
        <div className="max-w-6xl mx-auto">
          <p
            className="font-semibold mb-10"
            style={{ color: "var(--neutral-100)", fontSize: "16px" }}
          >
            Groundwork
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
            {FOOTER_COLS.map((col) => (
              <div key={col.heading}>
                <p
                  className="font-semibold uppercase mb-4"
                  style={{
                    color: "var(--neutral-500)",
                    fontSize: "11px",
                    letterSpacing: "0.08em",
                  }}
                >
                  {col.heading}
                </p>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="transition-colors"
                        style={{
                          color: "var(--neutral-400)",
                          fontSize: "14px",
                          textDecoration: "none",
                        }}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div
            className="border-t pt-8 flex flex-col sm:flex-row justify-between gap-3"
            style={{ borderColor: "var(--neutral-800)" }}
          >
            <p style={{ color: "var(--neutral-600)", fontSize: "13px" }}>
              &copy; {new Date().getFullYear()} Timberline Coffee School. All rights reserved.
            </p>
            <p style={{ color: "var(--neutral-600)", fontSize: "13px" }}>
              Groundwork is a product of Timberline Coffee School.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ── PricingCard ──────────────────────────────────────────────────────────── */

type PlanData = {
  name: string;
  price: string;
  period: string;
  note: string;
  features: string[];
  cta: string;
  href: string;
  recommended: boolean;
  accent: boolean;
};

function PricingCard({ plan }: { plan: PlanData }) {
  return (
    <div
      className="flex flex-col rounded-2xl p-6 border transition-all duration-200 hover:-translate-y-1"
      style={{
        background: plan.accent ? "var(--teal)" : "white",
        borderColor: plan.accent ? "var(--teal)" : "#E5E5E0",
        boxShadow: plan.recommended
          ? "0 12px 40px rgba(21,94,99,0.22), 0 2px 8px rgba(21,94,99,0.12)"
          : "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      {plan.recommended && (
        <p
          className="font-semibold uppercase mb-4"
          style={{ fontSize: "10px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.7)" }}
        >
          Most popular
        </p>
      )}
      <p
        className="font-semibold mb-3"
        style={{
          fontSize: "18px",
          color: plan.accent ? "white" : "#0D0D0B",
          fontWeight: 600,
        }}
      >
        {plan.name}
      </p>
      <div className="flex items-baseline gap-1 mb-1">
        <span
          style={{
            fontSize: "38px",
            fontWeight: 700,
            lineHeight: 1,
            color: plan.accent ? "white" : "#0D0D0B",
            letterSpacing: "-0.02em",
          }}
        >
          {plan.price}
        </span>
        {plan.period && (
          <span
            style={{
              fontSize: "14px",
              color: plan.accent ? "rgba(255,255,255,0.7)" : "#8F8F85",
            }}
          >
            {plan.period}
          </span>
        )}
      </div>
      <p
        className="mb-6"
        style={{
          fontSize: "12px",
          color: plan.accent ? "rgba(255,255,255,0.6)" : "#8F8F85",
          fontWeight: 300,
        }}
      >
        {plan.note}
      </p>
      <ul className="space-y-2.5 mb-8 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <span
              style={{
                color: plan.accent ? "rgba(255,255,255,0.8)" : "var(--sage)",
                fontSize: "14px",
                flexShrink: 0,
                marginTop: "1px",
              }}
            >
              &#10003;
            </span>
            <span
              style={{
                fontSize: "13px",
                color: plan.accent ? "rgba(255,255,255,0.85)" : "#4A4A42",
                lineHeight: 1.5,
              }}
            >
              {f}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href={plan.href}
        className="w-full text-center py-3 px-5 rounded-lg font-semibold text-sm transition-all hover:-translate-y-0.5"
        style={{
          background: plan.accent ? "white" : "var(--teal)",
          color: plan.accent ? "var(--teal)" : "white",
          boxShadow: plan.accent
            ? "0 4px 16px rgba(0,0,0,0.15)"
            : "0 2px 8px rgba(21,94,99,0.2)",
          display: "block",
        }}
      >
        {plan.cta}
      </Link>
    </div>
  );
}
