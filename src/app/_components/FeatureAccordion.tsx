"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type AccordionItem = {
  title: string;
  oneLiner: string;
  bullets: string[];
  accent?: "teal" | "sage";
  icon?: React.ReactNode;
  step?: string;
};

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

function Chevron({ open, color }: { open: boolean; color: string }) {
  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <polyline points="6 9 12 15 18 9" />
    </motion.svg>
  );
}

export function FeatureAccordionCard({
  item,
  open,
  onToggle,
  layout = "icon",
}: {
  item: AccordionItem;
  open: boolean;
  onToggle: () => void;
  layout?: "icon" | "step";
}) {
  const accent = item.accent ?? "teal";
  const accentColor = accent === "sage" ? "var(--sage)" : "var(--teal)";
  const accentBg =
    accent === "sage" ? "rgba(118,179,157,0.12)" : "rgba(21,94,99,0.08)";
  const accentBorder =
    accent === "sage" ? "rgba(118,179,157,0.25)" : "rgba(21,94,99,0.18)";

  return (
    <div
      className={`bg-white rounded-xl border h-full flex flex-col transition-all duration-200 ${
        open ? "" : "hover:-translate-y-1"
      }`}
      style={{
        boxShadow: open
          ? "0 8px 28px rgba(21,94,99,0.10), 0 2px 6px rgba(0,0,0,0.05)"
          : "0 1px 4px rgba(0,0,0,0.04)",
        borderColor: open ? accentBorder : "#E5E5E0",
        borderLeftWidth: "3px",
        borderLeftColor: accentColor,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left p-5 flex items-start gap-4 rounded-xl focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        style={
          {
            outlineColor: accentColor,
          } as React.CSSProperties
        }
      >
        {layout === "step" ? (
          <span
            className="font-bold flex-shrink-0"
            style={{
              fontSize: "13px",
              color: accentColor,
              opacity: 0.5,
              marginTop: "2px",
              letterSpacing: "0.02em",
            }}
          >
            {item.step}
          </span>
        ) : (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: accentBg, color: accentColor }}
          >
            {item.icon}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3
              className="font-semibold"
              style={{
                fontSize: "15px",
                color: accentColor,
                lineHeight: 1.3,
              }}
            >
              {item.title}
            </h3>
            <span className="flex-shrink-0 mt-0.5">
              <Chevron open={open} color={accentColor} />
            </span>
          </div>
          <p
            className="text-neutral-600 mt-1.5"
            style={{ fontSize: "13px", lineHeight: 1.5 }}
          >
            {item.oneLiner}
          </p>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <ul
              className="px-5 pb-5 space-y-2"
              style={{
                borderTop: `1px solid ${accentBorder}`,
                paddingTop: "14px",
              }}
            >
              {item.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5">
                  <span
                    className="flex-shrink-0"
                    style={{
                      color: accentColor,
                      fontSize: "14px",
                      lineHeight: 1.4,
                      marginTop: "1px",
                    }}
                  >
                    &#10003;
                  </span>
                  <span
                    className="text-neutral-700"
                    style={{ fontSize: "13px", lineHeight: 1.55 }}
                  >
                    {bullet}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FeatureAccordion({
  items,
  layout = "icon",
  columns = 3,
}: {
  items: AccordionItem[];
  layout?: "icon" | "step";
  columns?: 1 | 2 | 3;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const gridClass =
    columns === 1
      ? "grid grid-cols-1 gap-4"
      : columns === 2
        ? "grid grid-cols-1 md:grid-cols-2 gap-5"
        : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5";

  return (
    <div className={gridClass}>
      {items.map((item, i) => (
        <FeatureAccordionCard
          key={item.title}
          item={item}
          layout={layout}
          open={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? null : i)}
        />
      ))}
    </div>
  );
}
