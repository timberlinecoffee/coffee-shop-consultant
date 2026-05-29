"use client";

import Image from "next/image";
import type { ReactNode } from "react";

export interface ModuleCardProps {
  /** Module display title shown in the card footer */
  title: string;
  /** One-line description of what the module covers */
  description: string;
  /** Mockup element rendered inside the card body */
  mockup: ReactNode;
  /** Optional Pexels photo URL shown as a thumbnail strip above the mockup */
  thumbnailSrc?: string;
  /** Alt text for the thumbnail — required when thumbnailSrc is provided */
  thumbnailAlt?: string;
}

/**
 * Homepage feature card used in the "module showcase" section.
 *
 * @example
 * <ModuleCard
 *   title="Financials"
 *   description="Build a 12-month projection with benchmark comparisons."
 *   mockup={<FinancialsMockup />}
 *   thumbnailSrc="https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=600&h=200&dpr=1"
 *   thumbnailAlt="Espresso machine at a coffee shop counter"
 * />
 */
export default function ModuleCard({ title, description, mockup, thumbnailSrc, thumbnailAlt }: ModuleCardProps) {
  return (
    <div
      className="rounded-2xl overflow-hidden border border-neutral-200 bg-white hover:-translate-y-1 transition-all duration-200 h-full flex flex-col"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
    >
      {thumbnailSrc && (
        <div className="relative w-full" style={{ height: "140px" }}>
          <Image
            src={thumbnailSrc}
            alt={thumbnailAlt ?? title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        </div>
      )}
      {!thumbnailSrc && (
        <div className="flex items-center gap-1.5 px-3" style={{ height: "28px", background: "var(--warm-surface)", borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--warm-surface-2)" }} />
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--warm-surface-2)" }} />
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--warm-surface-2)" }} />
        </div>
      )}
      <div className="flex-1" style={{ minHeight: "200px" }}>{mockup}</div>
      <div className="px-5 py-4 border-t border-neutral-100">
        <p className="font-semibold mb-1" style={{ fontSize: "14px", color: "var(--teal)" }}>{title}</p>
        <p className="text-neutral-600" style={{ fontSize: "13px", lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  );
}
