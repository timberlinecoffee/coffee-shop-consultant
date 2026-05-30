"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/* Ketut Subiyanto (Pexels License) — same photographer as the lower benefit
   sections. Three baristas in green aprons laughing in a bright, airy cafe.
   Founder feedback (TIM-1444): hero must show the green-apron + lighter-cafe
   vibe from the Ketut Subiyanto shoot, not the moodier dark-cafe shot.
   Distinct image used nowhere else on the page. */
const HERO_PHOTO =
  "https://images.pexels.com/photos/4349916/pexels-photo-4349916.jpeg?auto=compress&cs=tinysrgb&w=900";

function BrowserMockup() {
  const sidebarItems = [
    { label: "Concept", pct: 100 },
    { label: "Financials", pct: 67, active: true },
    { label: "Operations", pct: 20 },
    { label: "Staffing", pct: 40 },
    { label: "Equipment", pct: 0 },
    { label: "Menu", pct: 0 },
    { label: "Marketing", pct: 0 },
    { label: "Launch", pct: 12 },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--card)",
        boxShadow:
          "0 32px 80px rgba(0,0,0,0.32), 0 8px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.15)",
      }}
    >
      {/* Browser chrome bar */}
      <div
        className="flex items-center gap-2 px-4"
        style={{
          background: "var(--ui-dark-1)",
          height: "38px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--ui-red)" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--ui-yellow)" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--ui-green)" }} />
        </div>
        <div
          className="flex-1 mx-3 rounded-md flex items-center px-3"
          style={{ background: "var(--ui-dark-2)", height: "22px" }}
        >
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px", letterSpacing: "0.01em" }}>
            app.groundwork.coffee/plan
          </span>
        </div>
      </div>

      {/* App layout */}
      <div className="flex" style={{ minHeight: "320px", background: "var(--neutral-100)" }}>
        {/* Sidebar */}
        <div
          className="hidden sm:flex flex-col"
          style={{
            width: "175px",
            flexShrink: 0,
            background: "white",
            borderRight: "1px solid var(--border-subtle)",
            padding: "16px 0",
          }}
        >
          <p
            className="font-semibold px-4 mb-5"
            style={{ color: "var(--teal)", fontSize: "13px", letterSpacing: "-0.01em" }}
          >
            Groundwork
          </p>
          {sidebarItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 px-3 py-1.5"
              style={{
                borderLeft: item.active ? "2px solid var(--teal)" : "2px solid transparent",
                background: item.active ? "rgba(21,94,99,0.06)" : "transparent",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background:
                    item.pct === 100 ? "var(--sage)" : item.active ? "var(--teal)" : "var(--neutral-300)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: item.active ? "var(--teal)" : "var(--neutral-600)",
                  fontSize: "12px",
                  fontWeight: item.active ? 600 : 400,
                }}
              >
                {item.label}
              </span>
              {item.pct > 0 && (
                <span className="ml-auto" style={{ color: "var(--neutral-400)", fontSize: "10px" }}>
                  {item.pct}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 p-5" style={{ background: "var(--neutral-50)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold" style={{ color: "var(--neutral-950)", fontSize: "16px" }}>
                Financials
              </p>
              <p style={{ color: "var(--neutral-500)", fontSize: "11px", marginTop: "1px" }}>
                Section 2 of 8
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--sage)", fontSize: "11px", fontWeight: 600 }}>
                67%
              </span>
              <div
                className="rounded-full"
                style={{ height: "5px", width: "64px", background: "var(--neutral-300)", overflow: "hidden" }}
              >
                <div
                  style={{
                    height: "5px",
                    width: "67%",
                    background: "var(--sage)",
                    borderRadius: "9999px",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "Startup cost", value: "$142,500" },
              { label: "Monthly rent", value: "$4,200" },
              { label: "Break-even", value: "Month 14" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg p-3 border"
                style={{ background: "white", borderColor: "var(--border-subtle)" }}
              >
                <p
                  style={{
                    color: "var(--neutral-500)",
                    fontSize: "9px",
                    marginBottom: "3px",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {s.label}
                </p>
                <p style={{ color: "var(--teal)", fontSize: "16px", fontWeight: 700, lineHeight: 1 }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Benchmark bar */}
          <div
            className="rounded-lg px-3 py-2.5 mb-3 flex items-center gap-2"
            style={{ background: "rgba(118,179,157,0.1)", border: "1px solid rgba(118,179,157,0.25)" }}
          >
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--sage)" }}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ color: "var(--teal)", fontSize: "11px", fontWeight: 500 }}>
              Startup cost is within the healthy range for this market size
            </p>
          </div>

          {/* AI chat bar */}
          <div
            className="rounded-lg px-3 py-2.5 flex items-center gap-2 border"
            style={{ background: "white", borderColor: "var(--border-subtle)" }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(21,94,99,0.1)" }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--teal)"
                strokeWidth="2.5"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p style={{ color: "var(--neutral-400)", fontSize: "11px" }}>
              Ask about your financials...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomepageHero() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{
        background:
          "linear-gradient(130deg, #0c3a3d 0%, #155e63 55%, #1a7880 100%)",
      }}
    >
      <div className="relative z-10 max-w-6xl mx-auto w-full px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
        {/* Left — headline + CTAs */}
        <div>
          <motion.h1
            className="font-bold text-white mb-5"
            style={{
              fontSize: "clamp(1.875rem, 5.5vw, 3.75rem)",
              lineHeight: 1.07,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              textWrap: "balance",
            }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.52, delay: 0.18, ease: EASE }}
          >
            From <span style={{ whiteSpace: "nowrap" }}>Coffee Shop Idea</span>
            <br />
            to Open Sign.
          </motion.h1>

          <motion.p
            className="mb-9 text-white"
            style={{
              fontSize: "1.1875rem",
              lineHeight: "1.6",
              opacity: 0.82,
              fontWeight: 400,
              maxWidth: "460px",
            }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28, ease: EASE }}
          >
            Build your coffee shop plan, even without a business background.
            Groundwork shows you what to plan next, checks it against real
            shops, and points to your next move.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-3"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.38, ease: EASE }}
          >
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-semibold text-sm transition-all"
              style={{
                background: "white",
                color: "var(--teal)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
              }}
            >
              Start Your Plan
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-medium text-sm text-white transition-all"
              style={{ border: "1px solid rgba(255,255,255,0.28)", backdropFilter: "blur(8px)" }}
            >
              See How It Works
            </Link>
          </motion.div>

          {/* Platform feature blurbs (replaces false stats) */}
          <motion.ul
            className="mt-10 space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.52, ease: "easeOut" }}
          >
            {[
              "Guided suite from concept to opening day",
              "Benchmarks from real coffee shops, not generic templates",
              "AI co-pilot that fills the business-background gap",
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
                  style={{ fontSize: "14px", lineHeight: 1.45, opacity: 0.82 }}
                >
                  {feature}
                </p>
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Right — browser mockup */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.3, ease: EASE }}
        >
          <BrowserMockup />

          {/* Framed coffee-shop photo composed over the screenshot's lower-left
              edge — same photo-mixed-with-UI language as the lower benefit
              sections, with the screenshot as the anchor and the photo as the
              smaller floating element. */}
          <motion.div
            className="absolute -bottom-12 -left-10 sm:-left-16 z-20"
            style={{ width: "248px", maxWidth: "55vw", transform: "rotate(-5deg)" }}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.7, ease: EASE }}
          >
            <div
              className="relative rounded-2xl overflow-hidden aspect-[4/3]"
              style={{
                border: "4px solid white",
                boxShadow: "0 20px 50px rgba(0,0,0,0.36)",
              }}
            >
              <Image
                src={HERO_PHOTO}
                alt="Three baristas in green aprons laughing together during a break in a bright modern coffee shop. Photo: Ketut Subiyanto / Pexels."
                fill
                priority
                className="object-cover"
                style={{ objectPosition: "center 40%" }}
                sizes="248px"
              />
              {/* Warm overlay matches the lower benefit-section photos */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "rgba(245,230,211,0.08)" }}
              />
            </div>
          </motion.div>

          {/* Floating benchmarking accent card */}
          <motion.div
            className="absolute -top-4 -right-4 rounded-xl px-4 py-3 hidden sm:block"
            style={{
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.2)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.8, ease: EASE }}
          >
            <p className="font-semibold text-white" style={{ fontSize: "13px" }}>
              Benchmarked Against Real Shops
            </p>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", marginTop: "1px" }}>
              Know if your plan is sustainable
            </p>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1" aria-hidden="true">
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          style={{ color: "rgba(255,255,255,0.35)", fontSize: "20px" }}
        >
          ↓
        </motion.div>
      </div>
    </section>
  );
}
