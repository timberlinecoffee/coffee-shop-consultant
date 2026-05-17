import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import HomeNav from "./_components/HomeNav";

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
  heroBarista: "https://images.pexels.com/photos/5377637/pexels-photo-5377637.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&dpr=1",
  baristaSmiling: "https://images.pexels.com/photos/4349736/pexels-photo-4349736.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&dpr=1",
  baristaBeard: "https://images.pexels.com/photos/5553518/pexels-photo-5553518.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&dpr=1",
  cafeMachine: "https://images.pexels.com/photos/12859353/pexels-photo-12859353.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&dpr=1",
  barPour: "https://images.pexels.com/photos/12859354/pexels-photo-12859354.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&dpr=1",
};

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    title: "Eight guided modules",
    body: "From concept and financials through build-out, menu, marketing, and launch: every decision gets its own planning tool.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>
      </svg>
    ),
    title: "Live financial model",
    body: "Your startup cost estimate and 12-month projection update as you fill in your actual lease terms, equipment, and staffing.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "AI coach, coffee specific",
    body: "Ask about your plan and get answers from a coach who has been in specialty coffee for fifteen years. Not general business advice.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
    title: "Export as PDF",
    body: "Every module produces a document. All eight combine into your Business Readiness Document: a real plan for lenders and partners.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    ),
    title: "Progress tracking",
    body: "See exactly where you are across all eight modules. Pick up where you left off, on your phone, laptop, or tablet.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Built by someone who opened shops",
    body: "Trent Rollings is a World Coffee Championships judge and SCA Authorized Trainer who has personally opened and closed coffee businesses.",
  },
];

const TESTIMONIALS = [
  {
    quote: "I had a business plan from a consultant that cost me $8,000. Groundwork found three gaps that plan missed, and I hadn't paid a subscription yet.",
    name: "Daniela Reyes",
    city: "Portland, OR",
  },
  {
    quote: "The financial model updated every time I changed my lease terms. I went into negotiations knowing exactly what I could afford.",
    name: "James Okafor",
    city: "Chicago, IL",
  },
  {
    quote: "I've been in coffee for twelve years. I still learned things I didn't know I didn't know.",
    name: "Sarah Kim",
    city: "Seattle, WA",
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

      {/* ── Hero ───────────────────────────────────────────────────────────────
          Full-bleed Ketut Subiyanto photo with light-leaning overlay so the
          page stays bright at the fold. Headline bottom-left anchored.
      ─────────────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex flex-col justify-end overflow-hidden">
        <Image
          src={PEXELS.heroBarista}
          alt="Barista working in a specialty coffee shop, natural light"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        {/* Overlay — warm tint, lighter than before */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(21,94,99,0.80) 0%, rgba(21,94,99,0.25) 50%, rgba(0,0,0,0.10) 100%)",
          }}
        />
        <div className="relative z-10 max-w-6xl mx-auto w-full px-6 pb-14 sm:pb-20">
          <p
            className="font-semibold uppercase mb-4 text-white/70"
            style={{ fontSize: "11px", letterSpacing: "0.14em" }}
          >
            Coffee shop planning
          </p>
          <h1
            className="text-white font-bold mb-4"
            style={{ fontSize: "clamp(2.5rem, 6vw, 3.75rem)", lineHeight: 1.08, fontWeight: 700 }}
          >
            From idea to open sign.
          </h1>
          <p
            className="text-white mb-8 max-w-lg"
            style={{ fontSize: "1.125rem", lineHeight: "1.65", opacity: 0.9, fontWeight: 400 }}
          >
            A planning tool for people serious about opening a coffee shop.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login?plan=builder"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-semibold text-sm bg-white text-teal hover:bg-neutral-100 transition-all shadow-sm hover:shadow-md"
            >
              Start your plan
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-medium text-sm text-white border border-white/40 hover:border-white/70 transition-all backdrop-blur-sm"
            >
              See how it works
            </Link>
          </div>
        </div>
        {/* Scroll indicator */}
        <div className="absolute bottom-7 right-8 z-10 flex flex-col items-center gap-1" aria-hidden="true">
          <div className="w-px bg-white/30 overflow-hidden" style={{ height: "36px" }}>
            <div className="scroll-indicator-line w-full bg-white" />
          </div>
        </div>
      </section>

      {/* ── Product preview strip ───────────────────────────────────────────── */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-neutral-500 text-sm mb-10 font-medium">
            Built by a World Coffee Championships judge. Everything from concept through launch in one place.
          </p>
          <div
            className="rounded-2xl overflow-hidden border border-neutral-200 shadow-lg shadow-neutral-200/50"
          >
            <LightDashboardScreenshot />
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────────
          Clean 3-column grid on white. No dark backgrounds.
      ─────────────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p
              className="font-semibold uppercase mb-3 text-teal"
              style={{ fontSize: "11px", letterSpacing: "0.12em" }}
            >
              What&apos;s included
            </p>
            <h2
              className="font-bold text-neutral-950"
              style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)", lineHeight: 1.2, fontWeight: 700 }}
            >
              Eight sections. Everything a new coffee shop needs.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-xl p-6 border border-neutral-200 hover:border-teal/40 hover:-translate-y-0.5 transition-all duration-200 cursor-default"
                style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
              >
                <div className="w-10 h-10 rounded-lg bg-teal/8 flex items-center justify-center text-teal mb-4" style={{ background: "rgba(21,94,99,0.08)" }}>
                  {f.icon}
                </div>
                <h3 className="font-semibold text-neutral-950 mb-2" style={{ fontSize: "15px" }}>
                  {f.title}
                </h3>
                <p className="text-neutral-600 leading-relaxed" style={{ fontSize: "14px" }}>
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Photography break + value props ────────────────────────────────────
          60/40 split: photo left, module cards right. Light bg.
      ─────────────────────────────────────────────────────────────────────── */}
      <section className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            {/* Photo left (3 cols) */}
            <div className="lg:col-span-3 relative">
              <div className="rounded-2xl overflow-hidden aspect-[4/3]">
                <Image
                  src={PEXELS.baristaSmiling}
                  alt="Barista serving coffee in a specialty cafe"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 60vw"
                />
              </div>
              {/* Floating stat card */}
              <div
                className="absolute bottom-4 left-4 bg-white rounded-xl px-4 py-3 shadow-lg border border-neutral-200"
              >
                <p className="font-bold text-teal" style={{ fontSize: "22px", lineHeight: 1 }}>8</p>
                <p className="text-neutral-600 mt-0.5" style={{ fontSize: "12px" }}>planning modules</p>
              </div>
            </div>
            {/* Cards right (2 cols) */}
            <div className="lg:col-span-2 space-y-4">
              <p
                className="font-semibold uppercase text-teal mb-2"
                style={{ fontSize: "11px", letterSpacing: "0.12em" }}
              >
                A plan, not just advice
              </p>
              <h2
                className="font-bold text-neutral-950 mb-6"
                style={{ fontSize: "clamp(1.4rem, 3vw, 1.875rem)", lineHeight: 1.25, fontWeight: 700 }}
              >
                You leave with documents, not notes.
              </h2>
              {[
                { num: "01", title: "Startup cost estimate", body: "Built from your specific lease, equipment, and staffing decisions." },
                { num: "02", title: "12-month financial model", body: "Updates as your plan changes. Know your break-even before you sign a lease." },
                { num: "03", title: "Launch checklist", body: "Tied to your actual timeline. Nothing generic." },
              ].map((item) => (
                <div
                  key={item.num}
                  className="flex gap-4 p-4 rounded-xl border border-neutral-200 bg-neutral-50 hover:border-teal/30 transition-colors"
                >
                  <span
                    className="font-bold text-teal flex-shrink-0"
                    style={{ fontSize: "13px", opacity: 0.5, marginTop: "2px" }}
                  >
                    {item.num}
                  </span>
                  <div>
                    <p className="font-semibold text-neutral-950 mb-0.5" style={{ fontSize: "14px" }}>
                      {item.title}
                    </p>
                    <p className="text-neutral-600" style={{ fontSize: "13px", lineHeight: 1.5 }}>
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
              <Link
                href="/login?plan=builder"
                className="inline-flex items-center justify-center w-full px-6 py-3 rounded-lg font-semibold text-sm text-white transition-all mt-2"
                style={{ background: "var(--teal)" }}
              >
                Start your plan &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials — light background ───────────────────────────────────
          No dark section. White cards on neutral-50 bg.
      ─────────────────────────────────────────────────────────────────────── */}
      <section style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
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
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="bg-white rounded-xl p-6 border border-neutral-200 hover:border-teal/30 hover:-translate-y-0.5 transition-all duration-200"
                style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
              >
                {/* Teal accent bar */}
                <div className="w-8 h-0.5 mb-5" style={{ background: "var(--teal)" }} />
                <blockquote
                  className="text-neutral-700 leading-relaxed mb-5"
                  style={{
                    fontFamily: "var(--font-lora, Georgia), serif",
                    fontStyle: "italic",
                    fontSize: "1rem",
                    lineHeight: "1.75",
                  }}
                >
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <p className="font-semibold text-neutral-950" style={{ fontSize: "13px" }}>
                  {t.name}
                </p>
                <p className="text-neutral-500" style={{ fontSize: "12px", marginTop: "2px" }}>
                  {t.city}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Second photo + CTA break ────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ minHeight: "340px" }}>
        <Image
          src={PEXELS.baristaBeard}
          alt="Barista preparing espresso in a specialty coffee shop"
          fill
          className="object-cover object-center"
          sizes="100vw"
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, rgba(21,94,99,0.88) 0%, rgba(21,94,99,0.65) 100%)",
          }}
        />
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-8">
          <div>
            <h2
              className="text-white font-bold mb-2"
              style={{ fontSize: "clamp(1.4rem, 3vw, 1.875rem)", lineHeight: 1.2, fontWeight: 700 }}
            >
              Most people who open coffee shops don&apos;t have a business background.
            </h2>
            <p className="text-white/80" style={{ fontSize: "1rem", lineHeight: 1.65 }}>
              Groundwork doesn&apos;t assume you do.
            </p>
          </div>
          <Link
            href="/login?plan=builder"
            className="flex-shrink-0 inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-semibold text-sm bg-white text-teal hover:bg-neutral-100 transition-all shadow-sm"
          >
            Start your plan
          </Link>
        </div>
      </section>

      {/* ── Pricing — vertical 3-column cards ─────────────────────────────────
          Standard SaaS layout. Accelerator center + slightly elevated.
      ─────────────────────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-white" style={{ padding: "96px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p
              className="font-semibold uppercase mb-3 text-teal"
              style={{ fontSize: "11px", letterSpacing: "0.12em" }}
            >
              Pricing
            </p>
            <h2
              className="font-bold text-neutral-950"
              style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)", lineHeight: 1.2, fontWeight: 700 }}
            >
              Start free. Go deeper when you&apos;re ready.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {PRICING.map((plan) => (
              <PricingCard key={plan.name} plan={plan} />
            ))}
          </div>
          <p className="text-center text-neutral-500 mt-8" style={{ fontSize: "13px" }}>
            All plans include access to the planning framework. Free plan has no time limit.
          </p>
        </div>
      </section>

      {/* ── About ───────────────────────────────────────────────────────────── */}
      <section
        id="about"
        style={{ background: "var(--neutral-50, #FAFAF8)", padding: "96px 24px" }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <div className="rounded-2xl overflow-hidden aspect-[4/3]">
                <Image
                  src={PEXELS.cafeMachine}
                  alt="Barista at a modern espresso machine in a specialty cafe"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
            </div>
            <div>
              <p
                className="font-semibold uppercase mb-4 text-teal"
                style={{ fontSize: "11px", letterSpacing: "0.12em" }}
              >
                Who built this
              </p>
              <h2
                className="font-bold text-neutral-950 mb-5"
                style={{ fontSize: "clamp(1.4rem, 3vw, 1.875rem)", lineHeight: 1.25, fontWeight: 700 }}
              >
                Built by someone who&apos;s been there.
              </h2>
              <p className="text-neutral-700 mb-4 leading-relaxed" style={{ fontSize: "1rem" }}>
                Trent Rollings is a World Coffee Championships judge, SCA Authorized Specialty Trainer,
                and the founder of Timberline Coffee School.
              </p>
              <p className="text-neutral-700 mb-8 leading-relaxed" style={{ fontSize: "1rem" }}>
                He spent years teaching the Coffee Shop Basecamp curriculum to aspiring owners and has
                personally opened and closed coffee businesses. This platform is everything he teaches
                in live cohorts, at a fraction of the consulting cost.
              </p>
              <Link
                href="/login?plan=builder"
                className="inline-flex items-center justify-center px-7 py-3 rounded-lg font-semibold text-sm text-white transition-all"
                style={{ background: "var(--teal)" }}
              >
                Start your plan for free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: "var(--neutral-900)", padding: "64px 24px 40px" }}>
        <div className="max-w-6xl mx-auto">
          <p
            className="font-semibold mb-10"
            style={{
              color: "var(--neutral-100)",
              fontSize: "16px",
            }}
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

      {/* Scroll indicator animation */}
      <style>{`
        @keyframes scroll-line {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .scroll-indicator-line {
          height: 100%;
          animation: scroll-line 1.8s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}

/* ── LightDashboardScreenshot ─────────────────────────────────────────────── */

function LightDashboardScreenshot() {
  const sidebarItems = [
    { label: "Concept", pct: 100 },
    { label: "Financials", pct: 67, active: true },
    { label: "Operations", pct: 20 },
    { label: "Staffing", pct: 40 },
    { label: "Build-Out", pct: 0 },
    { label: "Menu", pct: 0 },
    { label: "Marketing", pct: 0 },
    { label: "Launch", pct: 12 },
  ];

  return (
    <div className="w-full flex" style={{ background: "#F7F7F5", minHeight: "400px" }}>
      {/* Light sidebar */}
      <div
        className="hidden sm:flex flex-col"
        style={{
          width: "210px",
          flexShrink: 0,
          background: "white",
          borderRight: "1px solid #E5E5E0",
          padding: "20px 0",
        }}
      >
        <p
          className="font-semibold px-5 mb-7"
          style={{ color: "var(--teal)", fontSize: "14px", letterSpacing: "-0.01em" }}
        >
          Groundwork
        </p>
        {sidebarItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 px-4 py-2"
            style={{
              borderLeft: item.active ? "2px solid var(--teal)" : "2px solid transparent",
              background: item.active ? "rgba(21,94,99,0.06)" : "transparent",
            }}
          >
            <div
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: item.pct === 100 ? "var(--sage)" : item.active ? "var(--teal)" : "#D4D4CC",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: item.active ? "var(--teal)" : "#6B6B60",
                fontSize: "13px",
                fontWeight: item.active ? 600 : 400,
              }}
            >
              {item.label}
            </span>
            {item.pct > 0 && (
              <span
                className="ml-auto"
                style={{ color: "#B8B8B0", fontSize: "11px" }}
              >
                {item.pct}%
              </span>
            )}
          </div>
        ))}
      </div>
      {/* Main content */}
      <div className="flex-1 p-6 sm:p-8" style={{ background: "#FAFAF8" }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="font-semibold" style={{ color: "#0D0D0B", fontSize: "18px" }}>Financials</p>
            <p style={{ color: "#8F8F85", fontSize: "12px", marginTop: "2px" }}>Section 2 of 8</p>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--sage)", fontSize: "12px", fontWeight: 600 }}>67% complete</span>
            <div
              className="rounded-full"
              style={{ height: "6px", width: "80px", background: "#D4D4CC", overflow: "hidden" }}
            >
              <div style={{ height: "6px", width: "67%", background: "var(--sage)", borderRadius: "9999px" }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {[
            { label: "Startup cost", value: "$142,500", sub: "estimated" },
            { label: "Monthly rent", value: "$4,200", sub: "confirmed" },
            { label: "Break-even", value: "Month 14", sub: "projected" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl p-4 border"
              style={{ background: "white", borderColor: "#E5E5E0" }}
            >
              <p style={{ color: "#8F8F85", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {stat.label}
              </p>
              <p style={{ color: "#0D0D0B", fontSize: "20px", fontWeight: 700, lineHeight: 1 }}>
                {stat.value}
              </p>
              <p style={{ color: "var(--sage)", fontSize: "11px", marginTop: "4px", fontWeight: 500 }}>
                {stat.sub}
              </p>
            </div>
          ))}
        </div>
        {/* AI co-pilot drawer preview */}
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-3 border"
          style={{ background: "white", borderColor: "#E5E5E0" }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(21,94,99,0.08)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <p style={{ color: "#8F8F85", fontSize: "13px" }}>Ask about your financials...</p>
          <svg className="ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B8B8B0" strokeWidth="2">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </div>
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
      className="flex flex-col rounded-2xl p-6 border transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: plan.accent ? "var(--teal)" : "white",
        borderColor: plan.accent ? "var(--teal)" : "#E5E5E0",
        boxShadow: plan.recommended
          ? "0 8px 24px rgba(21,94,99,0.18)"
          : "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      {plan.recommended && (
        <p
          className="font-semibold uppercase mb-4 text-white/70"
          style={{ fontSize: "10px", letterSpacing: "0.12em" }}
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
        className="w-full text-center py-3 px-5 rounded-lg font-semibold text-sm transition-all"
        style={{
          background: plan.accent ? "white" : "var(--teal)",
          color: plan.accent ? "var(--teal)" : "white",
        }}
      >
        {plan.cta}
      </Link>
    </div>
  );
}
