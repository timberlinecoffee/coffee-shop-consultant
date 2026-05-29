import Link from "next/link";
import { UPGRADE_PATH } from "@/lib/access";

interface UpgradeGateProps {
  // Short heading shown on the gate card.
  title: string;
  // What the user gets after upgrading. Keep it specific.
  description: string;
  // Optional list of what's included with the paid tier.
  benefits?: string[];
  // Where they came from, so we can deep-link back after checkout.
  returnHref?: string;
}

export function UpgradeGate({
  title,
  description,
  benefits,
  returnHref,
}: UpgradeGateProps) {
  const upgradeHref = returnHref
    ? `${UPGRADE_PATH}?return=${encodeURIComponent(returnHref)}`
    : UPGRADE_PATH;

  return (
    <div
      data-testid="upgrade-gate"
      className="bg-white rounded-2xl border border-[var(--border)] p-8 sm:p-10 text-center max-w-2xl mx-auto"
    >
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--teal)]/10 flex items-center justify-center">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--teal)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">{title}</h2>
      <p className="text-sm text-[var(--muted-foreground)] leading-relaxed mb-6">
        {description}
      </p>

      {benefits && benefits.length > 0 && (
        <ul className="text-sm text-[var(--foreground)] text-left max-w-sm mx-auto space-y-2 mb-8">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--teal)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 flex-shrink-0"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href={upgradeHref}
          className="inline-block bg-[var(--teal)] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[var(--teal-dark)] transition-colors"
        >
          See plans
        </Link>
        <Link
          href="/dashboard"
          className="inline-block border border-[var(--border)] text-[var(--foreground)] text-sm font-medium px-5 py-2.5 rounded-xl hover:border-[var(--dark-grey)] transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
