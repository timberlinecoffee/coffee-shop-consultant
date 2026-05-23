"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

function BrowserMockup() {
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
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "#fff",
        boxShadow:
          "0 32px 80px rgba(0,0,0,0.32), 0 8px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.15)",
      }}
    >
      {/* Browser chrome bar */}
      <div
        className="flex items-center gap-2 px-4"
        style={{
          background: "#1C1C1E",
          height: "38px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#FF5F57" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#FFBD2E" }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#28C840" }} />
        </div>
        <div
          className="flex-1 mx-3 rounded-md flex items-center px-3"
          style={{ background: "#2C2C2E", height: "22px" }}
        >
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px", letterSpacing: "0.01em" }}>
            app.groundwork.coffee/plan
          </span>
        </div>
      </div>

      {/* App layout */}
      <div className="flex" style={{ minHeight: "320px", background: "#F7F7F5" }}>
        {/* Sidebar */}
        <div
          className="hidden sm:flex flex-col"
          style={{
            width: "175px",
            flexShrink: 0,
            background: "white",
            borderRight: "1px solid #E5E5E0",
            padding: "16px 0",
          }}
        >
          <p
            className="font-semibold px-4 mb-5"
            style={{ color: "#155e63", fontSize: "13px", letterSpacing: "-0.01em" }}
          >
            Groundwork
          </p>
          {sidebarItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 px-3 py-1.5"
              style={{
                borderLeft: item.active ? "2px solid #155e63" : "2px solid transparent",
                background: item.active ? "rgba(21,94,99,0.06)" : "transparent",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background:
                    item.pct === 100 ? "#76b39d" : item.active ? "#155e63" : "#D4D4CC",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: item.active ? "#155e63" : "#6B6B60",
                  fontSize: "12px",
                  fontWeight: item.active ? 600 : 400,
                }}
              >
                {item.label}
              </span>
              {item.pct > 0 && (
                <span className="ml-auto" style={{ color: "#B8B8B0", fontSize: "10px" }}>
                  {item.pct}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 p-5" style={{ background: "#FAFAF8" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold" style={{ color: "#0D0D0B", fontSize: "16px" }}>
                Financials
              </p>
              <p style={{ color: "#8F8F85", fontSize: "11px", marginTop: "1px" }}>
                Section 2 of 8
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "#76b39d", fontSize: "11px", fontWeight: 600 }}>
                67%
              </span>
              <div
                className="rounded-full"
                style={{ height: "5px", width: "64px", background: "#D4D4CC", overflow: "hidden" }}
              >
                <div
                  style={{
                    height: "5px",
                    width: "67%",
                    background: "#76b39d",
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
                style={{ background: "white", borderColor: "#E5E5E0" }}
              >
                <p
                  style={{
                    color: "#8F8F85",
                    fontSize: "9px",
                    marginBottom: "3px",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {s.label}
                </p>
                <p style={{ color: "#155e63", fontSize: "16px", fontWeight: 700, lineHeight: 1 }}>
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
              style={{ background: "#76b39d" }}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ color: "#155e63", fontSize: "11px", fontWeight: 500 }}>
              Startup cost is within the healthy range for this market size
            </p>
          </div>

          {/* AI chat bar */}
          <div
            className="rounded-lg px-3 py-2.5 flex items-center gap-2 border"
            style={{ background: "white", borderColor: "#E5E5E0" }}
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
                stroke="#155e63"
                strokeWidth="2.5"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p style={{ color: "#B8B8B0", fontSize: "11px" }}>
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
        background: "linear-gradient(130deg, #0c3a3d 0%, #155e63 55%, #1a7880 100%)",
      }}
    >
      {/* Dot grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Sage radial highlight — top left */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-200px",
          left: "-200px",
          width: "700px",
          height: "700px",
          background: "radial-gradient(circle, rgba(118,179,157,0.22) 0%, transparent 70%)",
        }}
      />

      {/* Warm radial highlight — bottom right */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "-150px",
          right: "-100px",
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(200,168,130,0.12) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto w-full px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
        {/* Left — headline + CTAs */}
        <div>
          <motion.p
            className="font-semibold uppercase mb-5"
            style={{
              fontSize: "11px",
              letterSpacing: "0.14em",
              color: "rgba(118,179,157,0.9)",
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: EASE }}
          >
            Coffee shop planning
          </motion.p>

          <motion.h1
            className="font-bold text-white mb-5"
            style={{
              fontSize: "clamp(2.6rem, 5.5vw, 3.75rem)",
              lineHeight: 1.07,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.52, delay: 0.18, ease: EASE }}
          >
            From idea
            <br />
            to open sign.
          </motion.h1>

          <motion.p
            className="mb-9 text-white"
            style={{
              fontSize: "1.125rem",
              lineHeight: "1.65",
              opacity: 0.75,
              fontWeight: 400,
              maxWidth: "440px",
            }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28, ease: EASE }}
          >
            An AI planning companion for people serious about opening a coffee shop.
            Guided decisions. Real benchmarks. Action, not just paperwork.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-3"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.38, ease: EASE }}
          >
            <Link
              href="/login?plan=builder"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-semibold text-sm transition-all"
              style={{
                background: "white",
                color: "#155e63",
                boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
              }}
            >
              Start your plan
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-medium text-sm text-white transition-all"
              style={{ border: "1px solid rgba(255,255,255,0.28)", backdropFilter: "blur(8px)" }}
            >
              See how it works
            </Link>
          </motion.div>

          {/* Trust micro-stats */}
          <motion.div
            className="flex items-center gap-6 mt-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.52, ease: "easeOut" }}
          >
            {[
              { num: "1,200+", label: "coffee shops planned" },
              { num: "AI", label: "consultant built in" },
              { num: "15+", label: "years expertise" },
            ].map((s) => (
              <div key={s.label}>
                <p
                  className="font-bold text-white"
                  style={{ fontSize: "20px", lineHeight: 1, letterSpacing: "-0.01em" }}
                >
                  {s.num}
                </p>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", marginTop: "2px" }}>
                  {s.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right — browser mockup */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.3, ease: EASE }}
        >
          <BrowserMockup />

          {/* Floating "AI coach" accent card — sage tinted */}
          <motion.div
            className="absolute -bottom-4 -left-6 rounded-xl px-4 py-3 hidden sm:block"
            style={{
              background: "rgba(118,179,157,0.18)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(118,179,157,0.35)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.24)",
            }}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.7, ease: EASE }}
          >
            <p className="font-semibold text-white" style={{ fontSize: "13px" }}>
              AI coffee consultant
            </p>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "11px", marginTop: "1px" }}>
              Specialty-specific answers
            </p>
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
              Benchmarked against real data
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
