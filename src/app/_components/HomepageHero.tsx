"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/* TIM-1642: Illustration-led hero. Board (TIM-1576) directed the continuous-line,
   monochrome coffee-shop scene into the landing-page hero — off-white stroke on
   Groundwork --teal. Asset rendered on TIM-1578 (gpt-image-1.5, board-approved
   key 9c9f8dbb), on-brand line-art verified on TIM-1579. The section background is
   flat var(--teal) (#155e63) so the illustration's own teal field blends seamlessly,
   matching the reference screenshot. Wired deliberately as a direct placement, not
   via getAsset() manifest precedence. */
const HERO_ILLUSTRATION = "/images/illustrations/hero/hero-your-coffee-shop.webp";

export default function HomepageHero() {
  return (
    <section
      className="relative flex flex-col items-center overflow-hidden"
      style={{ background: "var(--teal)" }}
    >
      <div className="relative z-10 max-w-3xl mx-auto w-full px-6 pt-28 pb-12 text-center">
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
          Plan your coffee shop with{" "}
          <span style={{ whiteSpace: "nowrap", color: "var(--sage)" }}>
            confidence
          </span>
          .
        </motion.h1>

        <motion.p
          className="mb-9 text-white mx-auto"
          style={{
            fontSize: "1.1875rem",
            lineHeight: "1.6",
            opacity: 0.82,
            fontWeight: 400,
            maxWidth: "560px",
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.28, ease: EASE }}
        >
          Build your coffee shop plan, even without a business background.
          Groundwork shows you what to plan next, checks it against real shops,
          and points to your next move.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-3 justify-center"
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
      </div>

      {/* Line-art scene, full-bleed on the matching teal field so it reads as one
          continuous surface with the hero background (see reference screenshot). */}
      <motion.div
        className="relative z-10 w-full"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.5, ease: EASE }}
      >
        <Image
          src={HERO_ILLUSTRATION}
          alt="Continuous line illustration of a coffee shop interior with an espresso machine, pour-over station, plants, and a pendant lamp, drawn in off-white line art on Groundwork teal."
          width={1536}
          height={1024}
          priority
          className="w-full h-auto"
          style={{ maxHeight: "560px", objectFit: "contain" }}
          sizes="100vw"
        />
      </motion.div>
    </section>
  );
}
