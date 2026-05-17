import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import HomeNav from "./_components/HomeNav";
import HomepageHero from "./_components/HomepageHero";
import {
  FadeUp,
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
// Selected for contextual fit: barista craft at work, warm/personal portrait
const PEXELS = {
  baristaAtWork:
    "https://images.pexels.com/photos/5553518/pexels-photo-5553518.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1",
  baristaPortrait:
    "https://images.pexels.com/photos/4349736/pexels-photo-4349736.jpeg?auto=compress&cs=tinysrgb&w=900&h=700&dpr=1",
  cafeInterior:
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
    body: "Concept through launch — every decision gets its own planning workspace, in the right order.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>
      </svg>
    ),
    title: "Live financial model",
    body: "Your startup cost estimate and 12-month projection update as you fill in your actual lease, equipment, and staffing.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "AI coffee consultant",
    body: "Ask questions, get specific answers. The AI coach is trained on specialty coffee expertise — not generic business advice.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
    title: "Export as PDF",
    body: "Every module produces a document. All eight combine into your Business Readiness Document for lenders and partners.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    ),
    title: "Progress tracking",
    body: "See where you are across all eight modules. Resume on any device, exactly where you left off.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Built by someone who opened shops",
    body: "Trent Rollings is a World Coffee Championships judge and SCA Authorized Trainer who has opened and closed real coffee businesses.",
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

      {/* ── Social proof / stats bar ──────────────────────────────────────────── */}
      <section className="bg-white border-b border-neutral-200" style={{ padding: "48px 24px" }}>
        <div className="max-w-4xl mx-auto">
          <FadeUp>
            <p className="text-center text-neutral-500 text-sm mb-10 font-medium">
              Built by a World Coffee Championships judge. Everything from concept through launch in one place.
            </p>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { target: 1200, suffix: "+", label: "Plans started" },
              { target: 8, suffix: "", label: "Planning modules" },
              { target: 15, suffix: "+", label: "Years in specialty coffee" },
            ].map((s) => (
              <StaggerItem key={s.label}>
                <div>
                  <p
                    className="font-bold"
                    style={{ fontSize: "40px", lineHeight: 1, color: "var(--teal)", letterSpacing: "-0.02em" }}
                  >
                    <AnimatedCounter target={s.target} suffix={s.suffix} />
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

      {/* ── Features ─────────────────────────────────────────────────────────────
          Teal heading. Staggered card entrance on scroll.
      ─────────────────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-14">
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--teal)" }}
            >
              What&apos;s included
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
                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: "rgba(21,94,99,0.08)", color: "var(--teal)" }}
                  >
                    {f.icon}
                  </div>
                  <h3
                    className="font-semibold mb-2"
                    style={{ fontSize: "15px", color: "var(--teal)" }}
                  >
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

      {/* ── AI consultant companion ───────────────────────────────────────────────
          Teal-tinted surface. Left: copy. Right: chat UI mockup.
      ─────────────────────────────────────────────────────────────────────────── */}
      <section
        className="bg-white"
        style={{ padding: "96px 24px" }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            {/* Left — copy */}
            <div>
              <FadeUp>
                <p
                  className="font-semibold uppercase mb-4"
                  style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--teal)" }}
                >
                  AI consultant
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
                  Your personal coffee expert, always in your corner.
                </h2>
                <p className="text-neutral-600 mb-8 leading-relaxed" style={{ fontSize: "1rem" }}>
                  Groundwork isn&apos;t a form you fill out and submit. It&apos;s a planning
                  companion that guides you — and when you have a question, a real specialty coffee
                  expert answers it.
                </p>
                <StaggerContainer className="space-y-4">
                  {[
                    {
                      title: "Specific, not generic",
                      body: "Ask about your market, your lease terms, your equipment choices. Answers tailored to your actual plan.",
                    },
                    {
                      title: "Trained on real expertise",
                      body: "15 years in specialty coffee. World Coffee Championships judge. This is not a general business chatbot.",
                    },
                    {
                      title: "Available at every step",
                      body: "The consultant is integrated into every module — concept, financials, menu, build-out, launch.",
                    },
                  ].map((item) => (
                    <StaggerItem key={item.title}>
                      <div className="flex gap-3">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: "rgba(21,94,99,0.1)" }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#155e63" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                        <div>
                          <p
                            className="font-semibold mb-0.5"
                            style={{ fontSize: "14px", color: "var(--teal)" }}
                          >
                            {item.title}
                          </p>
                          <p className="text-neutral-600" style={{ fontSize: "13px", lineHeight: 1.55 }}>
                            {item.body}
                          </p>
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              </FadeUp>
            </div>

            {/* Right — chat mockup */}
            <ScaleIn delay={0.1}>
              <AIChatMockup />
            </ScaleIn>
          </div>
        </div>
      </section>

      {/* ── Value props — contained photo + numbered list ─────────────────────────
          Photo on the left in a rounded frame (not full-bleed). Text on right.
      ─────────────────────────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            {/* Contained photo — 3 cols */}
            <ScaleIn className="lg:col-span-3 relative">
              <div className="rounded-2xl overflow-hidden aspect-[4/3] relative">
                <Image
                  src={PEXELS.baristaAtWork}
                  alt="Specialty coffee barista focused on their craft"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 60vw"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom right, transparent 60%, rgba(14,68,72,0.18) 100%)",
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
                <p
                  className="font-bold"
                  style={{ fontSize: "22px", lineHeight: 1, color: "var(--teal)" }}
                >
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
                  className="font-semibold uppercase mb-2"
                  style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--teal)" }}
                >
                  A plan, not just advice
                </p>
                <h2
                  className="font-bold mb-6"
                  style={{
                    fontSize: "clamp(1.4rem, 3vw, 1.875rem)",
                    lineHeight: 1.25,
                    fontWeight: 700,
                    color: "var(--teal)",
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
                      className="flex gap-4 p-4 rounded-xl border border-neutral-200 bg-white hover:border-teal/30 transition-colors"
                    >
                      <span
                        className="font-bold flex-shrink-0"
                        style={{ fontSize: "13px", color: "var(--teal)", opacity: 0.45, marginTop: "2px" }}
                      >
                        {item.num}
                      </span>
                      <div>
                        <p
                          className="font-semibold mb-0.5"
                          style={{ fontSize: "14px", color: "var(--teal)" }}
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

      {/* ── Module snapshots strip ────────────────────────────────────────────────
          3 mini browser-chrome cards showing different platform modules.
      ─────────────────────────────────────────────────────────────────────────── */}
      <section className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-14">
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--teal)" }}
            >
              Inside the platform
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
              Every module, purpose-built for the decision it covers.
            </h2>
          </FadeUp>
          <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StaggerItem>
              <ModuleCard
                title="Financials"
                description="Live startup cost estimate and 12-month projection. Updates as your plan details change."
                mockup={<FinancialsMockup />}
              />
            </StaggerItem>
            <StaggerItem>
              <ModuleCard
                title="Menu Pricing"
                description="Build your menu with cost-per-cup analysis and margin targets built in."
                mockup={<MenuMockup />}
              />
            </StaggerItem>
            <StaggerItem>
              <ModuleCard
                title="Launch Plan"
                description="A milestone-based launch checklist tied to your actual target open date."
                mockup={<LaunchMockup />}
              />
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────────────────
          Lora italic quotes. Stagger on scroll. Teal heading.
      ─────────────────────────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-12">
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--teal)" }}
            >
              From people who used it
            </p>
            <h2
              className="font-bold"
              style={{ fontSize: "clamp(1.5rem, 3.5vw, 2rem)", lineHeight: 1.25, fontWeight: 700, color: "var(--teal)" }}
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
                      <p
                        className="font-semibold"
                        style={{ fontSize: "13px", color: "var(--teal)" }}
                      >
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

      {/* ── CTA break — gradient, no photo ────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(130deg, #0c3a3d 0%, #155e63 55%, #1a7880 100%)",
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

      {/* ── Pricing ───────────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-14">
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--teal)" }}
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

      {/* ── About ─────────────────────────────────────────────────────────────── */}
      <section id="about" style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <ScaleIn className="relative">
              <div className="rounded-2xl overflow-hidden aspect-[4/3] relative">
                <Image
                  src={PEXELS.baristaPortrait}
                  alt="Specialty coffee professional — warm and welcoming"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
            </ScaleIn>
            <div>
              <FadeUp>
                <p
                  className="font-semibold uppercase mb-4"
                  style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--teal)" }}
                >
                  Who built this
                </p>
                <h2
                  className="font-bold mb-5"
                  style={{
                    fontSize: "clamp(1.4rem, 3vw, 1.875rem)",
                    lineHeight: 1.25,
                    fontWeight: 700,
                    color: "var(--teal)",
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
                  style={{ color: "var(--neutral-500)", fontSize: "11px", letterSpacing: "0.08em" }}
                >
                  {col.heading}
                </p>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="transition-colors"
                        style={{ color: "var(--neutral-400)", fontSize: "14px", textDecoration: "none" }}
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

/* ── AIChatMockup ─────────────────────────────────────────────────────────── */

function AIChatMockup() {
  const messages = [
    {
      role: "user" as const,
      text: "What startup cost should I plan for a 900 sq ft cafe in a mid-size city?",
    },
    {
      role: "assistant" as const,
      text: "For a 900 sq ft buildout in a mid-size market, I'd budget $110k–$165k all-in. Here's the breakdown I'd use:",
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
      role: "user" as const,
      text: "How does that change if I go with a drive-through format?",
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#155e63" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <p className="font-semibold" style={{ fontSize: "13px", color: "var(--teal)" }}>
            AI Coffee Consultant
          </p>
          <p style={{ color: "#8F8F85", fontSize: "11px" }}>
            Trained on 15+ years of specialty coffee expertise
          </p>
        </div>
        <div
          className="ml-auto w-2 h-2 rounded-full"
          style={{ background: "#2A6B4A", flexShrink: 0 }}
        />
      </div>

      {/* Messages */}
      <div className="p-4 space-y-3" style={{ background: "#FAFAF8" }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div
                className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mr-2 mt-0.5"
                style={{ background: "rgba(21,94,99,0.1)", flexShrink: 0 }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#155e63" strokeWidth="2.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
            )}
            <div
              className="rounded-xl px-3 py-2 max-w-xs"
              style={{
                background: msg.role === "user" ? "var(--teal)" : "white",
                borderRadius:
                  msg.role === "user"
                    ? "14px 14px 2px 14px"
                    : "2px 14px 14px 14px",
                border: msg.role === "assistant" ? "1px solid #E5E5E0" : "none",
              }}
            >
              {msg.text && (
                <p
                  style={{
                    fontSize: "12px",
                    color: msg.role === "user" ? "rgba(255,255,255,0.92)" : "#2E2E28",
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
                      <span style={{ fontSize: "12px", color: "#2E2E28", lineHeight: 1.4 }}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        <div className="flex justify-start">
          <div
            className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mr-2"
            style={{ background: "rgba(21,94,99,0.1)" }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#155e63" strokeWidth="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div
            className="rounded-xl px-3 py-2.5 flex items-center gap-1"
            style={{
              background: "white",
              border: "1px solid #E5E5E0",
              borderRadius: "2px 14px 14px 14px",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#B8B8B0" }} />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#B8B8B0" }} />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#B8B8B0" }} />
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-t border-neutral-200"
        style={{ background: "white" }}
      >
        <div
          className="flex-1 rounded-lg px-3 py-2"
          style={{ background: "#F7F7F5", fontSize: "12px", color: "#B8B8B0" }}
        >
          Ask about your plan...
        </div>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "var(--teal)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ── ModuleCard ───────────────────────────────────────────────────────────── */

function ModuleCard({
  title,
  description,
  mockup,
}: {
  title: string;
  description: string;
  mockup: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden border border-neutral-200 bg-white hover:-translate-y-1 transition-all duration-200"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
    >
      {/* Mini browser chrome */}
      <div
        className="flex items-center gap-1.5 px-3"
        style={{ height: "28px", background: "#F0F0EE", borderBottom: "1px solid #E5E5E0" }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: "#E0E0DC" }} />
        <span className="w-2 h-2 rounded-full" style={{ background: "#E0E0DC" }} />
        <span className="w-2 h-2 rounded-full" style={{ background: "#E0E0DC" }} />
      </div>
      {/* Content */}
      <div style={{ minHeight: "200px" }}>{mockup}</div>
      {/* Label */}
      <div className="px-5 py-4 border-t border-neutral-100">
        <p className="font-semibold mb-1" style={{ fontSize: "14px", color: "var(--teal)" }}>
          {title}
        </p>
        <p className="text-neutral-600" style={{ fontSize: "13px", lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
    </div>
  );
}

/* ── FinancialsMockup ─────────────────────────────────────────────────────── */

function FinancialsMockup() {
  return (
    <div className="p-4" style={{ background: "#FAFAF8" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>
          Financials
        </p>
        <span style={{ color: "#76b39d", fontSize: "10px", fontWeight: 600 }}>67%</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: "Startup cost", value: "$142,500" },
          { label: "Monthly rent", value: "$4,200" },
          { label: "Break-even", value: "Month 14" },
          { label: "Year 1 revenue", value: "$328k" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg p-2.5 border"
            style={{ background: "white", borderColor: "#E5E5E0" }}
          >
            <p style={{ color: "#8F8F85", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>
              {s.label}
            </p>
            <p style={{ color: "var(--teal)", fontSize: "14px", fontWeight: 700, lineHeight: 1 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-lg p-3" style={{ background: "white", border: "1px solid #E5E5E0" }}>
        <p style={{ color: "#8F8F85", fontSize: "9px", marginBottom: "6px" }}>12-month projection</p>
        <div className="flex items-end gap-1 h-10">
          {[20, 35, 45, 55, 60, 68, 75, 82, 88, 90, 95, 100].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${h}%`, background: i < 6 ? "#E5E5E0" : "var(--sage)", opacity: i < 6 ? 0.6 : 1 }}
            />
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
    <div className="p-4" style={{ background: "#FAFAF8" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>
          Menu Pricing
        </p>
        <span
          className="rounded px-2 py-0.5"
          style={{ background: "rgba(21,94,99,0.08)", color: "var(--teal)", fontSize: "10px", fontWeight: 600 }}
        >
          4 items
        </span>
      </div>
      <div
        className="rounded-lg overflow-hidden border"
        style={{ borderColor: "#E5E5E0" }}
      >
        <div
          className="grid grid-cols-4 px-3 py-1.5"
          style={{ background: "#F0F0EE" }}
        >
          {["Item", "Cost", "Price", "Margin"].map((h) => (
            <p key={h} style={{ fontSize: "9px", color: "#8F8F85", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {h}
            </p>
          ))}
        </div>
        {items.map((item, i) => (
          <div
            key={item.name}
            className="grid grid-cols-4 px-3 py-2"
            style={{
              background: "white",
              borderTop: i > 0 ? "1px solid #F0F0EE" : "none",
            }}
          >
            <p style={{ fontSize: "11px", color: "var(--teal)", fontWeight: 500 }}>{item.name}</p>
            <p style={{ fontSize: "11px", color: "#8F8F85" }}>{item.cost}</p>
            <p style={{ fontSize: "11px", color: "#4A4A42" }}>{item.price}</p>
            <p style={{ fontSize: "11px", color: "#2A6B4A", fontWeight: 600 }}>{item.margin}</p>
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
    { label: "Staff hired", done: false, date: "May 1" },
    { label: "Soft open", done: false, date: "Jun 1" },
    { label: "Grand opening", done: false, date: "Jun 15" },
  ];

  return (
    <div className="p-4" style={{ background: "#FAFAF8" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>
          Launch Plan
        </p>
        <span style={{ color: "#76b39d", fontSize: "10px", fontWeight: 600 }}>3 of 6 done</span>
      </div>
      <div className="space-y-1.5">
        {milestones.map((m) => (
          <div
            key={m.label}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2"
            style={{ background: "white", border: "1px solid #F0F0EE" }}
          >
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: m.done ? "#76b39d" : "#E5E5E0" }}
            >
              {m.done && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
            <p
              style={{
                fontSize: "11px",
                color: m.done ? "#8F8F85" : "var(--teal)",
                textDecoration: m.done ? "line-through" : "none",
                flex: 1,
              }}
            >
              {m.label}
            </p>
            <p style={{ fontSize: "10px", color: "#B8B8B0", flexShrink: 0 }}>{m.date}</p>
          </div>
        ))}
      </div>
    </div>
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
          color: plan.accent ? "white" : "var(--teal)",
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
            color: plan.accent ? "white" : "var(--teal)",
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
