// TIM-717 / TIM-621-AI — sidebar list of plan-aware financial flags.
// Server-rendered: takes the persisted flag set from workspace_documents and
// renders one row per flag with a severity colour. The save endpoint
// recomputes flags on every write (see route.ts), so re-rendering the page
// reflects the latest findings.

import type { Flag, FlagSeverity } from "@/lib/financials/sanityChecks";

const SEVERITY_STYLES: Record<FlagSeverity, { dot: string; chip: string; label: string }> = {
  error: {
    dot: "bg-[#b91c1c]",
    chip: "bg-[#fee2e2] text-[#991b1b]",
    label: "Critical",
  },
  warn: {
    dot: "bg-[#b45309]",
    chip: "bg-[#fef3c7] text-[#92400e]",
    label: "Warning",
  },
  info: {
    dot: "bg-[#155e63]",
    chip: "bg-[#cffafe] text-[#155e63]",
    label: "Info",
  },
};

const SEVERITY_ORDER: FlagSeverity[] = ["error", "warn", "info"];

interface AiFindingsSidebarProps {
  flags: Flag[];
  lastRunAt: string | null;
}

export function AiFindingsSidebar({ flags, lastRunAt }: AiFindingsSidebarProps) {
  const sorted = [...flags].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  return (
    <aside
      className="bg-white rounded-2xl border border-[#efefef] p-5 space-y-3"
      data-testid="financials-ai-findings"
      aria-label="AI sanity-check findings"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#1a1a1a]">AI findings</h2>
        {lastRunAt ? (
          <time
            className="text-[11px] text-[#9a9a9a]"
            dateTime={lastRunAt}
            title={`Last computed ${new Date(lastRunAt).toLocaleString()}`}
          >
            updated {new Date(lastRunAt).toLocaleDateString()}
          </time>
        ) : null}
      </header>

      {sorted.length === 0 ? (
        <p className="text-sm text-[#6b6b6b] leading-relaxed">
          No flags. Your plan passes the first-shop sanity checks.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((flag, idx) => {
            const style = SEVERITY_STYLES[flag.severity] ?? SEVERITY_STYLES.info;
            return (
              <li
                key={`${flag.rule_id}-${idx}`}
                className="flex gap-3"
                data-rule-id={flag.rule_id}
                data-severity={flag.severity}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-[2px] text-[10px] font-medium uppercase tracking-wide ${style.chip}`}
                    >
                      {style.label}
                    </span>
                    <span className="text-[11px] text-[#9a9a9a]">
                      {flag.rule_id.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm text-[#1a1a1a] leading-snug">{flag.message}</p>
                  {flag.evidence ? (
                    <p className="text-[11px] text-[#6b6b6b]">{flag.evidence}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
