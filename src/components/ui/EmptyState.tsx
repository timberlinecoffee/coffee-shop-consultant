"use client";

// TIM-2597: EmptyState — illustrated empty state with coffee-themed SVG,
// headline, body, and optional CTA. Replaces blank sections and default
// "no data" placeholders behind the ui_revamp_v2 flag.
//
// Apply to: Benchmarks "0 similar shops", coming-soon workspace sections,
// every workspace empty state.
//
// Style guide: Cards > Empty-state variant. Tokens: --card, --border,
// --foreground, --muted-foreground, --teal. Existing reference:
// src/components/benchmark/BenchmarkDashboard.tsx local EmptyState.

interface EmptyStateCTA {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  headline: string;
  body?: string;
  cta?: EmptyStateCTA;
  className?: string;
}

function CoffeeCupSVG() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
    >
      {/* Steam — three wavy lines */}
      <path
        d="M24 20 C24 16 27 16 27 12"
        stroke="var(--muted-foreground)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M36 18 C36 14 39 14 39 10"
        stroke="var(--muted-foreground)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M48 20 C48 16 51 16 51 12"
        stroke="var(--muted-foreground)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Cup body */}
      <path
        d="M16 32 L20 62 C20 63.1 20.9 64 22 64 L50 64 C51.1 64 52 63.1 52 62 L56 32 Z"
        fill="var(--muted)"
        stroke="var(--border)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Rim */}
      <rect
        x="13"
        y="27"
        width="46"
        height="8"
        rx="4"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      {/* Handle */}
      <path
        d="M52 38 C62 38 62 54 52 54"
        stroke="var(--border)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Saucer */}
      <ellipse
        cx="36"
        cy="66"
        rx="24"
        ry="4"
        fill="var(--muted)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      {/* Highlight stripe on cup */}
      <path
        d="M26 36 L24 58"
        stroke="var(--card)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

export function EmptyState({ headline, body, cta, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 py-12 rounded-xl border border-[var(--border)] bg-[var(--card)] ${className ?? ""}`}
    >
      <div className="mb-5 opacity-70">
        <CoffeeCupSVG />
      </div>

      <p className="text-sm font-semibold text-[var(--foreground)] leading-snug mb-1.5">
        {headline}
      </p>

      {body && (
        <p className="text-xs text-[var(--muted-foreground)] max-w-xs leading-relaxed mb-5">
          {body}
        </p>
      )}

      {cta && (
        <CTAButton cta={cta} />
      )}
    </div>
  );
}

function CTAButton({ cta }: { cta: EmptyStateCTA }) {
  const cls =
    "inline-flex items-center text-xs font-semibold px-4 py-2 rounded-lg bg-[var(--teal)] text-white hover:opacity-90 transition-opacity";

  if (cta.href) {
    return (
      <a href={cta.href} className={cls}>
        {cta.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={cta.onClick} className={cls}>
      {cta.label}
    </button>
  );
}
