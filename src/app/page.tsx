import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import HomeNav from "./_components/HomeNav";
import { getPrimaryPhoto, buildUnsplashSrc } from "@/lib/photography";

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

const heroPhoto = getPrimaryPhoto("homepage-hero");
const financialsPhoto = getPrimaryPhoto("module-financials");
const staffingPhoto = getPrimaryPhoto("module-staffing");
const launchPhoto = getPrimaryPhoto("module-launch");

const SECTION3_CARDS = [
  {
    label: "Financials",
    description: "Startup cost estimate and 12-month model",
    completion: 67,
    photo: financialsPhoto,
  },
  {
    label: "Staffing",
    description: "Team structure and hiring timeline",
    completion: 40,
    photo: staffingPhoto,
  },
  {
    label: "Launch",
    description: "Opening checklist tied to your timeline",
    completion: 12,
    photo: launchPhoto,
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I had a business plan from a consultant that cost me $8,000. Groundwork found three gaps that plan missed, and I hadn't paid a subscription yet.",
    name: "Daniela Reyes",
    city: "Portland, OR",
  },
  {
    quote:
      "The financial model updated every time I changed my lease terms. I went into negotiations knowing exactly what I could afford.",
    name: "James Okafor",
    city: "Chicago, IL",
  },
  {
    quote:
      "I've been in coffee for twelve years. I still learned things I didn't know I didn't know.",
    name: "Sarah Kim",
    city: "Seattle, WA",
  },
];

const PRICING = [
  {
    name: "Builder",
    price: "$49",
    period: "/month",
    note: "$39/mo billed annually",
    features: [
      "Full access to all 8 modules",
      "Startup cost estimator",
      "12-month financial model",
      "Export your plan as PDF",
      "50 AI coach sessions per month",
      "Email support",
    ],
    cta: "Start your plan",
    href: "/login?plan=builder",
    recommended: false,
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
  const heroSrc = heroPhoto
    ? buildUnsplashSrc(heroPhoto.cdnUrl, { width: 1920, quality: 82 })
    : null;

  return (
    <main className="flex flex-col">
      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <HomeNav />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative h-screen min-h-[600px] flex flex-col justify-end overflow-hidden">
        {heroSrc && (
          <Image
            src={heroSrc}
            alt={heroPhoto!.alt}
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
        )}
        {/* Gradient — darkens bottom for text legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(13,13,11,0.75) 0%, rgba(13,13,11,0.35) 45%, transparent 80%)",
          }}
        />
        {/* Content — bottom-left anchored */}
        <div className="relative z-10 max-w-6xl mx-auto w-full px-6 pb-16 sm:pb-20">
          <h1
            className="text-white font-bold mb-4"
            style={{ fontSize: "clamp(2.5rem, 6vw, 3.5rem)", lineHeight: 1.1, fontWeight: 700 }}
          >
            From idea to open sign.
          </h1>
          <p
            className="text-white mb-8 max-w-xl"
            style={{ fontSize: "1.125rem", lineHeight: "1.6", opacity: 0.85, fontWeight: 400 }}
          >
            A planning tool for people serious about opening a coffee shop.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login?plan=builder"
              className="inline-flex items-center justify-center px-6 py-3 rounded-md font-semibold text-sm bg-white text-teal hover:bg-neutral-100 transition-colors"
            >
              Start your plan
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center justify-center px-6 py-3 rounded-md font-medium text-sm text-white underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              See how it works
            </Link>
          </div>
        </div>
        {/* Scroll indicator — bottom right */}
        <div className="absolute bottom-8 right-8 z-10 flex flex-col items-center gap-1" aria-hidden="true">
          <span
            className="text-white/40"
            style={{ fontSize: "10px", letterSpacing: "0.12em", fontWeight: 300 }}
          >
            SCROLL
          </span>
          <div
            className="w-px bg-white/20 overflow-hidden"
            style={{ height: "40px" }}
          >
            <div className="scroll-indicator-line w-full bg-white" />
          </div>
        </div>
      </section>

      {/* ── Section 2: What it is ───────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-white" style={{ padding: "120px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <p
            className="text-teal font-semibold uppercase mb-4"
            style={{ fontSize: "12px", letterSpacing: "0.08em" }}
          >
            What it is
          </p>
          <h2
            className="text-neutral-950 font-bold mb-6"
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              lineHeight: "1.2",
              fontWeight: 700,
              maxWidth: "680px",
            }}
          >
            Eight sections. Everything a new coffee shop needs.
          </h2>
          <p
            className="text-neutral-700 mb-16"
            style={{ fontSize: "1.125rem", lineHeight: "1.7", maxWidth: "640px", fontWeight: 400 }}
          >
            Groundwork walks you through concept, financials, operations, staffing,
            build-out, menu, marketing, and launch. Each section has a planning tool,
            a financial model, and a coach who has done this before.
          </p>
          <div
            className="w-full rounded-lg overflow-hidden border border-neutral-300"
            style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
          >
            <DashboardScreenshot />
          </div>
        </div>
      </section>

      {/* ── Section 3: What you get ─────────────────────────────────────────── */}
      <section style={{ background: "var(--neutral-100)", padding: "120px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-3">
              <p
                className="text-teal font-semibold uppercase mb-4"
                style={{ fontSize: "12px", letterSpacing: "0.08em" }}
              >
                What you get
              </p>
              <h2
                className="text-neutral-950 font-bold mb-8"
                style={{
                  fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
                  lineHeight: "1.25",
                  fontWeight: 700,
                }}
              >
                A plan, not just advice.
              </h2>
              <div className="space-y-5 mb-10">
                <p className="text-neutral-700" style={{ fontSize: "1rem", lineHeight: "1.7" }}>
                  Your startup cost estimate, built from your specific lease,
                  equipment, and staffing decisions.
                </p>
                <p className="text-neutral-700" style={{ fontSize: "1rem", lineHeight: "1.7" }}>
                  A 12-month financial model that updates as your plan changes.
                </p>
                <p className="text-neutral-700" style={{ fontSize: "1rem", lineHeight: "1.7" }}>
                  A launch checklist tied to your actual timeline.
                </p>
              </div>
              <Link
                href="/login?plan=builder"
                className="inline-flex items-center justify-center px-6 py-3 rounded-md font-semibold text-sm text-white transition-colors"
                style={{ background: "var(--teal)" }}
              >
                Start your plan &rarr;
              </Link>
            </div>
            <div className="lg:col-span-2 space-y-3">
              {SECTION3_CARDS.map((card) => (
                <WorkspaceCard key={card.label} card={card} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 4: Dark editorial testimonials ──────────────────────────── */}
      <section style={{ background: "var(--neutral-900)", padding: "120px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-white font-bold mb-6"
            style={{
              fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
              lineHeight: "1.2",
              fontWeight: 700,
              maxWidth: "680px",
            }}
          >
            Built for the part where you don&apos;t know what you don&apos;t know.
          </h2>
          <p
            className="text-white mb-16"
            style={{
              fontSize: "1.125rem",
              lineHeight: "1.7",
              opacity: 0.75,
              maxWidth: "560px",
              fontWeight: 400,
            }}
          >
            Most people who open coffee shops don&apos;t have a business background.
            Groundwork doesn&apos;t assume you do.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="flex flex-col gap-4">
                <blockquote
                  className="text-white leading-relaxed"
                  style={{
                    fontFamily: "var(--font-lora, Georgia), serif",
                    fontStyle: "italic",
                    fontSize: "1.125rem",
                    lineHeight: "1.7",
                  }}
                >
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <p
                  className="text-white/60"
                  style={{ fontSize: "12px", fontWeight: 300 }}
                >
                  {t.name}, {t.city}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 5: Pricing ──────────────────────────────────────────────── */}
      <section id="pricing" className="bg-white" style={{ padding: "120px 24px" }}>
        <div className="max-w-6xl mx-auto">
          <p
            className="text-teal font-semibold uppercase mb-4"
            style={{ fontSize: "12px", letterSpacing: "0.08em" }}
          >
            Pricing
          </p>
          <h2
            className="text-neutral-950 font-bold mb-12"
            style={{
              fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
              lineHeight: "1.25",
              fontWeight: 700,
            }}
          >
            Start free. Go deeper when you&apos;re ready.
          </h2>
          <div className="space-y-4">
            {PRICING.map((plan) => (
              <PricingRow key={plan.name} plan={plan} />
            ))}
          </div>
          <p className="text-neutral-500 mt-6" style={{ fontSize: "13px" }}>
            Free plan available. No credit card required to start.
          </p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: "var(--neutral-950)", padding: "64px 24px 40px" }}>
        <div className="max-w-6xl mx-auto">
          <p
            className="font-semibold mb-12"
            style={{
              color: "var(--neutral-200)",
              fontSize: "16px",
              fontFamily: "var(--font-poppins, Poppins), system-ui, sans-serif",
            }}
          >
            Groundwork
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
            {FOOTER_COLS.map((col) => (
              <div key={col.heading}>
                <p
                  className="font-semibold uppercase mb-4"
                  style={{
                    color: "var(--neutral-400)",
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
                        className="transition-colors hover:text-white"
                        style={{
                          color: "var(--neutral-400)",
                          fontSize: "14px",
                          fontWeight: 400,
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

      {/* ── Scroll indicator animation ───────────────────────────────────── */}
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

/* ── WorkspaceCard ────────────────────────────────────────────────────────── */

type CardData = {
  label: string;
  description: string;
  completion: number;
  photo: ReturnType<typeof getPrimaryPhoto>;
};

function WorkspaceCard({ card }: { card: CardData }) {
  const photoSrc = card.photo
    ? buildUnsplashSrc(card.photo.cdnUrl, { width: 160, quality: 80 })
    : null;

  return (
    <div
      className="flex items-stretch rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--neutral-300)", background: "white" }}
    >
      {photoSrc && card.photo && (
        <div className="relative flex-shrink-0" style={{ width: "72px" }}>
          <Image
            src={photoSrc}
            alt={card.photo.alt}
            fill
            className="object-cover"
            sizes="72px"
          />
        </div>
      )}
      <div className="flex-1 px-4 py-3">
        <p
          className="font-semibold mb-0.5"
          style={{ fontSize: "14px", color: "var(--neutral-950)", fontWeight: 600 }}
        >
          {card.label}
        </p>
        <p
          className="mb-2"
          style={{ fontSize: "12px", color: "var(--neutral-600)", fontWeight: 400 }}
        >
          {card.description}
        </p>
        <div className="flex items-center gap-2">
          <div
            className="flex-1 rounded-full"
            style={{ height: "4px", background: "var(--neutral-300)" }}
          >
            <div
              className="rounded-full"
              style={{ height: "4px", width: `${card.completion}%`, background: "var(--sage)" }}
            />
          </div>
          <span style={{ fontSize: "11px", color: "var(--neutral-500)", fontWeight: 300, flexShrink: 0 }}>
            {card.completion}%
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── PricingRow ───────────────────────────────────────────────────────────── */

type PlanData = {
  name: string;
  price: string;
  period: string;
  note: string;
  features: string[];
  cta: string;
  href: string;
  recommended: boolean;
};

function PricingRow({ plan }: { plan: PlanData }) {
  return (
    <div
      className="flex flex-col sm:flex-row gap-6 sm:gap-8 rounded-lg p-6 sm:p-8"
      style={{
        background: plan.recommended ? "var(--neutral-200)" : "white",
        border: plan.recommended
          ? "1px solid var(--neutral-300)"
          : "1px solid var(--neutral-300)",
        borderLeft: plan.recommended
          ? "3px solid var(--teal)"
          : "1px solid var(--neutral-300)",
      }}
    >
      <div className="sm:w-48 flex-shrink-0">
        <p
          className="font-semibold mb-2"
          style={{ fontSize: "18px", color: "var(--neutral-950)", fontWeight: 600 }}
        >
          {plan.name}
        </p>
        <div className="flex items-baseline gap-1 mb-1">
          <span style={{ fontSize: "36px", fontWeight: 700, color: "var(--neutral-950)", lineHeight: 1 }}>
            {plan.price}
          </span>
          <span style={{ fontSize: "14px", color: "var(--neutral-600)", fontWeight: 400 }}>
            {plan.period}
          </span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--neutral-500)", fontWeight: 300 }}>
          {plan.note}
        </p>
      </div>
      <ul className="flex-1 grid sm:grid-cols-2 gap-y-2.5 gap-x-6 content-start">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span style={{ color: "var(--sage)", fontSize: "14px", flexShrink: 0, marginTop: "2px" }}>
              &#10003;
            </span>
            <span style={{ fontSize: "14px", color: "var(--neutral-700)", fontWeight: 400 }}>
              {f}
            </span>
          </li>
        ))}
      </ul>
      <div className="sm:w-44 flex-shrink-0 flex items-center sm:justify-end">
        <Link
          href={plan.href}
          className="w-full sm:w-auto text-center py-3 px-6 rounded-md font-semibold text-sm transition-colors"
          style={{
            background: plan.recommended ? "var(--teal)" : "transparent",
            color: plan.recommended ? "white" : "var(--teal)",
            border: plan.recommended ? "none" : "1px solid var(--teal)",
          }}
        >
          {plan.cta}
        </Link>
      </div>
    </div>
  );
}

/* ── DashboardScreenshot ─────────────────────────────────────────────────── */

function DashboardScreenshot() {
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
    <div className="w-full flex" style={{ background: "var(--neutral-950)", minHeight: "420px" }}>
      {/* Sidebar */}
      <div
        className="hidden sm:flex flex-col"
        style={{
          width: "220px",
          flexShrink: 0,
          background: "var(--neutral-900)",
          borderRight: "1px solid var(--neutral-800)",
          padding: "24px 0",
        }}
      >
        <p
          className="font-semibold px-5 mb-8"
          style={{ color: "white", fontSize: "15px" }}
        >
          Groundwork
        </p>
        {sidebarItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 px-5 py-2.5"
            style={{
              borderLeft: item.active ? "2px solid var(--teal)" : "2px solid transparent",
              background: item.active ? "var(--neutral-800)" : "transparent",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background:
                  item.pct === 100
                    ? "var(--sage)"
                    : item.active
                    ? "var(--teal)"
                    : "var(--neutral-700)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: item.active ? "var(--neutral-200)" : "var(--neutral-600)",
                fontSize: "13px",
                fontWeight: item.active ? 500 : 400,
              }}
            >
              {item.label}
            </span>
            {item.pct > 0 && (
              <span className="ml-auto" style={{ color: "var(--neutral-600)", fontSize: "11px" }}>
                {item.pct}%
              </span>
            )}
          </div>
        ))}
      </div>
      {/* Main content panel */}
      <div className="flex-1 p-6 sm:p-8">
        <p className="font-semibold mb-1" style={{ color: "white", fontSize: "20px" }}>
          Financials
        </p>
        <p className="mb-8" style={{ color: "var(--neutral-500)", fontSize: "13px" }}>
          Section 2 of 8
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { label: "Startup cost", value: "$142,500" },
            { label: "Monthly rent", value: "$4,200" },
            { label: "Break-even", value: "Month 14" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg p-4"
              style={{
                background: "var(--neutral-800)",
                border: "1px solid var(--neutral-700)",
              }}
            >
              <p style={{ color: "var(--neutral-400)", fontSize: "12px", marginBottom: "6px" }}>
                {stat.label}
              </p>
              <p style={{ color: "white", fontSize: "22px", fontWeight: 700 }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mb-3">
          <div className="flex justify-between mb-1.5">
            <span style={{ color: "var(--neutral-400)", fontSize: "12px" }}>Module progress</span>
            <span style={{ color: "var(--sage)", fontSize: "12px", fontWeight: 600 }}>67%</span>
          </div>
          <div
            className="w-full rounded-full"
            style={{ height: "6px", background: "var(--neutral-700)" }}
          >
            <div
              className="rounded-full"
              style={{ height: "6px", width: "67%", background: "var(--sage)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
