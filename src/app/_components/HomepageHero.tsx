"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/* TIM-1669: surgical correction of the TIM-1642 overshoot. The original two-column
   hero (copy, CTAs, feature list, teal gradient, layout) is restored exactly as it
   was pre-a2cf6f8. The ONLY delta vs. that original is the right-column visual: the
   former BrowserMockup app-screenshot + floating Pexels barista photo composition is
   replaced by the on-brand line-art illustration (TIM-1578 asset, TIM-1579 verified),
   placed cleanly in the same right-column slot with the same entrance animation.
   Direct placement (matching prior main behavior) rather than the getAsset() manifest,
   which renders nothing until the recipe asset is registered.
   TIM-1866: GENUINE gpt-image-1.5 portrait hero (Candidate D), 1024×1536, transparent
   alpha, rendered through OpenAI with the exact canonical recipe that produced the
   board-loved landscape (subject hero-interior, uniform 1.5px off-white stroke,
   outline-only) — just recomposed vertical. No vector fallback, no hand-editing.
   CEO-confirmed pick. Replaces the interim landscape placeholder and the rejected
   vector (TIM-1858). Rendered by scripts/render-hero-portrait-openai.mjs. */
const HERO_ILLUSTRATION = "/images/illustrations/hero/hero-your-coffee-shop-tall.webp";

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
            Plan your coffee shop{" "}
            <span style={{ color: "var(--sage)" }}>like you&apos;ve done it before.</span>
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
            Every number, plan, and document a new owner needs, built with you
            by an AI that knows the coffee business. Try it free for 7 days.
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
              Start your 7-day free trial
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-lg font-medium text-sm text-white transition-all"
              style={{ border: "1px solid rgba(255,255,255,0.28)", backdropFilter: "blur(8px)" }}
            >
              See How It Works
            </Link>
          </motion.div>

          <motion.p
            className="mt-3 text-white"
            style={{ fontSize: "12px", opacity: 0.6, fontWeight: 400 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ duration: 0.5, delay: 0.44, ease: "easeOut" }}
          >
            Full access. Cancel anytime before day 7 and you won&apos;t be charged.
          </motion.p>

          {/* Platform capability blurbs */}
          <motion.ul
            className="mt-8 space-y-3"
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

        {/* Right — line-art illustration (swapped in for the former app-screenshot
            mockup + floating photo composition; same slot, same entrance animation) */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.3, ease: EASE }}
        >
          <Image
            src={HERO_ILLUSTRATION}
            alt="Continuous line illustration of a coffee shop interior viewed across the counter, composed vertically from the counter up to hanging pendant lamps, with an espresso machine, pour-over station, window with a trailing plant, and a chalkboard menu, drawn in off-white line art that floats on the Groundwork teal gradient."
            width={1024}
            height={1536}
            priority
            className="w-full h-auto max-w-[480px] mx-auto"
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
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
