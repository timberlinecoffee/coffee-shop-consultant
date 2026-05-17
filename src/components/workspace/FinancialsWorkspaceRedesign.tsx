"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";

// ─── Inline types (financials schema not yet in main branch) ──────────────────

type StartupCostCategory =
  | "build_out"
  | "equipment"
  | "licenses"
  | "deposits"
  | "inventory"
  | "other";

interface StartupCostLine {
  id: string;
  category: StartupCostCategory;
  label: string;
  amount_cents: number;
  note?: string;
}

interface RevenueLine {
  id: string;
  stream: string;
  label: string;
  monthly_cents: number;
}

interface LaborLine {
  id: string;
  role: string;
  headcount: number;
  monthly_cents: number;
}

interface FixedCostLine {
  id: string;
  category: string;
  label: string;
  monthly_cents: number;
}

interface FundingLine {
  id: string;
  source: string;
  label: string;
  amount_cents: number;
}

interface FinancialsContent {
  schema_version: number;
  startup_costs: StartupCostLine[];
  monthly_pnl: {
    revenue: RevenueLine[];
    cogs_percent: number;
    labor: LaborLine[];
    fixed_costs: FixedCostLine[];
  };
  break_even: Record<string, unknown>;
  funding: FundingLine[];
}

const EMPTY_FINANCIALS: FinancialsContent = {
  schema_version: 1,
  startup_costs: [],
  monthly_pnl: { revenue: [], cogs_percent: 28, labor: [], fixed_costs: [] },
  break_even: {},
  funding: [],
};

function parseFinancialsContent(raw: unknown): FinancialsContent {
  if (!raw || typeof raw !== "object") return EMPTY_FINANCIALS;
  const r = raw as Record<string, unknown>;
  return {
    schema_version: 1,
    startup_costs: Array.isArray(r.startup_costs) ? (r.startup_costs as StartupCostLine[]) : [],
    monthly_pnl: r.monthly_pnl && typeof r.monthly_pnl === "object"
      ? (r.monthly_pnl as FinancialsContent["monthly_pnl"])
      : EMPTY_FINANCIALS.monthly_pnl,
    break_even: (r.break_even as Record<string, unknown>) ?? {},
    funding: Array.isArray(r.funding) ? (r.funding as FundingLine[]) : [],
  };
}

// ─── Money helpers ────────────────────────────────────────────────────────────

function fmtDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function parseCents(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, "") || "0");
  return Math.max(0, Math.round(n * 100));
}

function newId(): string {
  return crypto.randomUUID();
}

// ─── Startup cost section config ──────────────────────────────────────────────

const SECTION_CONFIGS = [
  {
    key: "equipment" as const,
    label: "Equipment",
    categories: ["equipment"] as StartupCostCategory[],
    defaultItems: [
      { label: "Espresso machine", tooltip: "Commercial machines range from $5,000 to $25,000 new." },
      { label: "Grinders", tooltip: "Plan $2,000 to $4,000 for a quality grinder." },
      { label: "Brewing equipment", tooltip: "Drip brewers, pour-over stations, cold brew systems." },
      { label: "Refrigeration", tooltip: "Reach-in coolers, under-counter units, bar fridges." },
    ],
  },
  {
    key: "lease_buildout" as const,
    label: "Lease and Build-Out",
    categories: ["build_out"] as StartupCostCategory[],
    defaultItems: [
      { label: "Security deposit", tooltip: "Typically 2–3 months of base rent." },
      { label: "Renovation and construction", tooltip: "Plumbing, electrical, flooring, walls." },
      { label: "Fixtures and millwork", tooltip: "Counters, shelving, signage, furniture." },
      { label: "Permits and inspections", tooltip: "Building permits, health department, fire inspection." },
    ],
  },
  {
    key: "pre_opening" as const,
    label: "Pre-Opening Costs",
    categories: ["licenses", "deposits", "inventory", "other"] as StartupCostCategory[],
    defaultItems: [
      { label: "Business licenses", tooltip: "State, city, and county business registration fees." },
      { label: "Opening inventory", tooltip: "Coffee, syrups, cups, packaging, food items." },
      { label: "Staff training wages", tooltip: "Wages paid during training before you open." },
      { label: "Marketing and launch", tooltip: "Signage, social media setup, opening event." },
    ],
  },
];

// Map section key to category for new lines
const SECTION_DEFAULT_CATEGORY: Record<string, StartupCostCategory> = {
  equipment: "equipment",
  lease_buildout: "build_out",
  pre_opening: "other",
};

// ─── Custom workspace icons (inline SVG) ─────────────────────────────────────

function IconConcept({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <ellipse cx="10" cy="10" rx="6" ry="8.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 4.5C10 4.5 8 6.5 8 9C8 11.5 10 13 10 13" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="7.5" y1="15.5" x2="12.5" y2="15.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconFinancials({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1" stroke={color} strokeWidth="1.4" />
      <rect x="11" y="3.5" width="5.5" height="5.5" rx="1" stroke={color} strokeWidth="1.4" />
      <rect x="3.5" y="11" width="5.5" height="5.5" rx="1" stroke={color} strokeWidth="1.4" />
      <rect x="11" y="11" width="5.5" height="5.5" rx="1" stroke={color} strokeWidth="1.4" />
      <line x1="5" y1="17" x2="7.5" y2="17" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="12.5" y1="17" x2="15" y2="17" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconOperations({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10.5" r="6" stroke={color} strokeWidth="1.4" />
      <line x1="10" y1="10.5" x2="10" y2="6.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="10" y1="10.5" x2="13" y2="10.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 3.5C9 3.5 10 2.5 11 3.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconStaffing({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7 13C5.5 13 3.5 13.8 3 15.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7" cy="9.5" r="2.5" stroke={color} strokeWidth="1.4" />
      <path d="M13.5 13C15 13 17 13.8 17.5 15.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="13.5" cy="9.5" r="2.5" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

function IconBuildOut({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="13" height="13" rx="1" stroke={color} strokeWidth="1.4" />
      <path d="M3.5 10H16.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10 10L10 16.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.5 16.5L6.5 13" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconMenu({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="5" y="2.5" width="10" height="15" rx="1.5" stroke={color} strokeWidth="1.4" />
      <circle cx="10" cy="10" r="2.5" stroke={color} strokeWidth="1.2" />
      <line x1="7" y1="5.5" x2="13" y2="5.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconMarketing({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 12L4 8L15 4V16L4 12Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M4 12V15" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconLaunch({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 16.5H17" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <rect x="5" y="9" width="10" height="7.5" stroke={color} strokeWidth="1.4" />
      <path d="M3 9L10 4L17 9" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="8.5" y="12" width="3" height="4.5" stroke={color} strokeWidth="1.2" />
      <rect x="11" y="10" width="2" height="1.5" rx="0.5" fill={color} opacity="0.8" />
    </svg>
  );
}

const MODULE_ITEMS = [
  { number: 1, label: "Concept",    Icon: IconConcept,    href: "/workspace/concept" },
  { number: 2, label: "Financials", Icon: IconFinancials, href: "/workspace/financials" },
  { number: 3, label: "Operations", Icon: IconOperations, href: "#" },
  { number: 4, label: "Staffing",   Icon: IconStaffing,   href: "#" },
  { number: 5, label: "Build-Out",  Icon: IconBuildOut,   href: "/workspace/buildout-equipment" },
  { number: 6, label: "Menu",       Icon: IconMenu,       href: "/workspace/menu-pricing" },
  { number: 7, label: "Marketing",  Icon: IconMarketing,  href: "#" },
  { number: 8, label: "Launch",     Icon: IconLaunch,     href: "/workspace/launch-plan" },
];

const ACTIVE_MODULE_INDEX = MODULE_ITEMS.findIndex(({ href }) => href === "/workspace/financials");

// ─── Live SVG cost breakdown chart ───────────────────────────────────────────

interface CostBreakdownChartProps {
  equipmentCents: number;
  leaseBuildoutCents: number;
  preOpeningCents: number;
}

function CostBreakdownChart({ equipmentCents, leaseBuildoutCents, preOpeningCents }: CostBreakdownChartProps) {
  const total = equipmentCents + leaseBuildoutCents + preOpeningCents;
  const W = 280;
  const H = 48;
  const R = 4;

  if (total === 0) {
    return (
      <div
        style={{
          height: H,
          background: "var(--neutral-200)",
          borderRadius: R,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
          Enter costs to see breakdown
        </span>
      </div>
    );
  }

  const eqPct = equipmentCents / total;
  const lbPct = leaseBuildoutCents / total;
  const poPct = preOpeningCents / total;

  const eqW = Math.round(W * eqPct);
  const lbW = Math.round(W * lbPct);
  const poW = W - eqW - lbW;

  const segments = [
    { width: eqW, color: "var(--color-teal)", label: "Equipment", pct: Math.round(eqPct * 100) },
    { width: lbW, color: "var(--color-sage)", label: "Lease/Build", pct: Math.round(lbPct * 100) },
    { width: Math.max(0, poW), color: "var(--color-crema)", label: "Pre-Opening", pct: Math.round(poPct * 100) },
  ].filter((s) => s.width > 0);

  let xOffset = 0;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} aria-label="Startup cost breakdown bar chart">
        <defs>
          <clipPath id="bar-clip">
            <rect x="0" y="0" width={W} height={H} rx={R} />
          </clipPath>
        </defs>
        <g clipPath="url(#bar-clip)">
          {segments.map((seg, i) => {
            const x = xOffset;
            xOffset += seg.width;
            return (
              <rect
                key={i}
                x={x}
                y={0}
                width={seg.width}
                height={H}
                fill={seg.color}
              />
            );
          })}
        </g>
      </svg>

      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {[
          { color: "var(--color-teal)", label: "Equipment", pct: Math.round(eqPct * 100), cents: equipmentCents },
          { color: "var(--color-sage)", label: "Lease/Build-Out", pct: Math.round(lbPct * 100), cents: leaseBuildoutCents },
          { color: "var(--color-crema)", label: "Pre-Opening", pct: Math.round(poPct * 100), cents: preOpeningCents },
        ].filter((s) => s.cents > 0).map((seg, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
              {seg.label} {seg.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Small readiness ring (32px, single fill) ────────────────────────────────

function ReadinessRingSmall({ pct }: { pct: number }) {
  const r = 12;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);

  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-label={`${pct}% complete`}>
      <circle cx="16" cy="16" r={r} fill="none" stroke="var(--neutral-300)" strokeWidth="3" />
      <circle
        cx="16"
        cy="16"
        r={r}
        fill="none"
        stroke="var(--color-teal)"
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 16 16)"
        style={{ transition: "stroke-dashoffset 300ms ease" }}
      />
      <text x="16" y="20" textAnchor="middle" style={{ fontSize: 8, fontWeight: 700, fill: "var(--neutral-950)", fontFamily: "Poppins, system-ui, sans-serif" }}>
        {pct}%
      </text>
    </svg>
  );
}

// ─── Collapsible form section ─────────────────────────────────────────────────

interface FormSectionProps {
  title: string;
  subtotalCents: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  onAddLine: () => void;
}

function FormSection({ title, subtotalCents, collapsed, onToggle, children, onAddLine }: FormSectionProps) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--neutral-200)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
        aria-expanded={!collapsed}
      >
        <span style={{
          fontSize: "var(--text-body)",
          fontWeight: 600,
          color: "var(--neutral-950)",
          lineHeight: "var(--text-body-lh)",
        }}>
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {subtotalCents > 0 && (
            <span style={{
              fontSize: "var(--text-body-sm)",
              fontWeight: 600,
              color: "var(--color-teal)",
            }}>
              ${fmtDollars(subtotalCents)}
            </span>
          )}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={{
              transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
              transition: "transform var(--duration-fast) ease-out",
              color: "var(--neutral-400)",
              flexShrink: 0,
            }}
          >
            <path d="M3 5.5L8 10.5L13 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      <div
        style={{
          maxHeight: collapsed ? 0 : "600px",
          overflow: "hidden",
          transition: "max-height var(--duration-fast) ease-out",
        }}
      >
        <div style={{ paddingBottom: 16 }}>
          {children}
          <button
            type="button"
            onClick={onAddLine}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: "var(--text-body-sm)",
              fontWeight: 500,
              color: "var(--color-teal)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              marginTop: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Add item
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cost input row ───────────────────────────────────────────────────────────

interface CostLineRowProps {
  line: StartupCostLine;
  tooltip?: string;
  onChange: (id: string, patch: Partial<StartupCostLine>) => void;
  onRemove: (id: string) => void;
}

function CostLineRow({ line, tooltip, onChange, onRemove }: CostLineRowProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <input
        type="text"
        value={line.label}
        onChange={(e) => onChange(line.id, { label: e.target.value })}
        placeholder="Item description"
        title={tooltip}
        style={{
          flex: 1,
          fontSize: "var(--text-body-sm)",
          color: "var(--neutral-800)",
          border: "1px solid var(--neutral-300)",
          borderRadius: 6,
          padding: "8px 10px",
          background: "var(--color-white)",
          outline: "none",
          fontFamily: "inherit",
        }}
        onFocus={(e) => { e.target.style.borderColor = "var(--color-teal)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--neutral-300)"; }}
      />
      <div style={{ position: "relative", flexShrink: 0 }}>
        <span style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: "var(--text-body-sm)",
          color: "var(--neutral-500)",
          pointerEvents: "none",
        }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={line.amount_cents > 0 ? fmtDollars(line.amount_cents) : ""}
          onChange={(e) => onChange(line.id, { amount_cents: parseCents(e.target.value) })}
          placeholder="0"
          style={{
            width: 120,
            fontSize: "var(--text-body-sm)",
            color: "var(--neutral-800)",
            border: "1px solid var(--neutral-300)",
            borderRadius: 6,
            padding: "8px 10px 8px 22px",
            background: "var(--color-white)",
            outline: "none",
            fontFamily: "inherit",
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--color-teal)"; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--neutral-300)"; }}
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(line.id)}
        aria-label={`Remove ${line.label || "item"}`}
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 6,
          border: "none",
          background: "none",
          cursor: "pointer",
          color: "var(--neutral-400)",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-danger)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--neutral-400)"; }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ─── Co-pilot drawer ──────────────────────────────────────────────────────────

const FIXTURE_RESPONSE =
  "Equipment costs vary most by whether you buy new or used. A used La Marzocco runs $8,000 to $12,000. A new Sanremo runs $15,000 to $22,000. The grinder decision matters more than most people think: budget $2,000 to $4,000 for a good one.";

function CoPilotDrawerInline({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState(FIXTURE_RESPONSE);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function toggle() {
    setOpen((prev) => {
      if (!prev) {
        setTimeout(() => inputRef.current?.focus(), 120);
      }
      return !prev;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setLoading(true);
    setResponse("");

    try {
      const res = await fetch("/api/copilot/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, workspaceKey: "financials", message: q }),
      });

      if (!res.ok || !res.body) {
        setResponse("Something went wrong. Try again.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const token = parsed?.choices?.[0]?.delta?.content ?? parsed?.delta ?? parsed?.text ?? "";
              text += token;
              setResponse(text);
            } catch {}
          }
        }
      }
    } catch {
      setResponse("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--neutral-300)",
        background: "var(--color-white)",
        overflow: "hidden",
        transition: `height var(--duration-normal) var(--ease-slide)`,
        height: open ? "280px" : "32px",
        flexShrink: 0,
      }}
    >
      {/* Collapsed bar */}
      <button
        type="button"
        onClick={toggle}
        style={{
          width: "100%",
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
        aria-expanded={open}
        aria-label="Toggle co-pilot"
      >
        <span style={{
          fontSize: "var(--text-body-sm)",
          color: "var(--neutral-500)",
          fontFamily: "inherit",
        }}>
          Ask about your financials...
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          style={{
            color: "var(--neutral-400)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--duration-fast) ease-out",
          }}
        >
          <path d="M2 9.5L7 4.5L12 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded content */}
      <div
        style={{
          padding: "0 16px 12px",
          display: "flex",
          flexDirection: "column",
          height: "248px",
          opacity: open ? 1 : 0,
          transition: `opacity 100ms ease ${open ? "100ms" : "0ms"}`,
        }}
      >
        {/* Response area */}
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 10, paddingTop: 4 }}>
          {loading ? (
            <span style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)", fontStyle: "italic" }}>
              Thinking...
            </span>
          ) : response ? (
            <p style={{
              fontSize: "var(--text-body)",
              lineHeight: "var(--text-body-lh)",
              color: "var(--neutral-950)",
              margin: 0,
            }}>
              {response}
            </p>
          ) : null}
        </div>

        {/* Input row */}
        <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do you want to know?"
            disabled={loading}
            style={{
              flex: 1,
              fontSize: "var(--text-body)",
              color: "var(--neutral-950)",
              border: "1px solid var(--neutral-300)",
              borderRadius: 6,
              padding: "8px 12px",
              background: "var(--color-white)",
              outline: "none",
              fontFamily: "inherit",
            }}
            onFocus={(e) => { e.target.style.borderColor = "var(--color-teal)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--neutral-300)"; }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              background: "var(--color-teal)",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: loading || !input.trim() ? 0.5 : 1,
              transition: "opacity 150ms ease",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FinancialsWorkspaceRedesignProps {
  planId: string;
}

export function FinancialsWorkspaceRedesign({ planId }: FinancialsWorkspaceRedesignProps) {
  const [financials, setFinancials] = useState<FinancialsContent>(EMPTY_FINANCIALS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    equipment: false,
    lease_buildout: false,
    pre_opening: true,
  });

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/workspaces/financials")
      .then((r) => r.json())
      .then(({ content }) => setFinancials(parseFinancialsContent(content)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((type: "success" | "error", msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, msg });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ── save ───────────────────────────────────────────────────────────────────
  const save = useCallback(async (data: FinancialsContent) => {
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces/financials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: data }),
      });
      if (!res.ok) {
        showToast("error", "We couldn't save that. Try again.");
      } else {
        showToast("success", "Saved");
      }
    } finally {
      setSaving(false);
    }
  }, [showToast]);

  const scheduleAutosave = useCallback((data: FinancialsContent) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(data), 1500);
  }, [save]);

  function update(changes: Partial<FinancialsContent>) {
    const next = { ...financials, ...changes };
    setFinancials(next);
    scheduleAutosave(next);
  }

  // ── startup cost mutations ─────────────────────────────────────────────────

  function addStartupCostLine(category: StartupCostCategory, label = "") {
    const line: StartupCostLine = { id: newId(), category, label, amount_cents: 0 };
    update({ startup_costs: [...financials.startup_costs, line] });
  }

  function updateStartupCostLine(id: string, patch: Partial<StartupCostLine>) {
    update({
      startup_costs: financials.startup_costs.map((l) =>
        l.id === id ? { ...l, ...patch } : l
      ),
    });
  }

  function removeStartupCostLine(id: string) {
    update({ startup_costs: financials.startup_costs.filter((l) => l.id !== id) });
  }

  // ── derived values ─────────────────────────────────────────────────────────

  function sectionLines(cats: StartupCostCategory[]) {
    return financials.startup_costs.filter((l) => cats.includes(l.category));
  }

  function sectionTotal(cats: StartupCostCategory[]) {
    return sectionLines(cats).reduce((s, l) => s + l.amount_cents, 0);
  }

  const equipmentCents = sectionTotal(["equipment"]);
  const leaseBuildoutCents = sectionTotal(["build_out"]);
  const preOpeningCents = sectionTotal(["licenses", "deposits", "inventory", "other"]);
  const grandTotal = equipmentCents + leaseBuildoutCents + preOpeningCents;

  // Completion pct for the ring (out of 3 sections that have data)
  const filledSections = [equipmentCents, leaseBuildoutCents, preOpeningCents].filter((c) => c > 0).length;
  const completionPct = Math.round((filledSections / 3) * 100);

  // Monthly rent from fixed costs
  const monthlyRentCents = financials.monthly_pnl?.fixed_costs
    ?.filter((f) => f.category === "rent")
    .reduce((s, f) => s + f.monthly_cents, 0) ?? 0;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "Poppins, system-ui, sans-serif" }}>
      {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
      <aside
        style={{
          width: 240,
          minWidth: 240,
          background: "var(--neutral-950)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Wordmark */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{
            fontSize: "var(--text-h4)",
            fontWeight: 600,
            color: "var(--color-teal)",
            lineHeight: 1,
          }}>
            Groundwork
          </span>
        </div>

        {/* Module nav */}
        <nav aria-label="Workspace modules" style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
          {MODULE_ITEMS.map(({ number, label, Icon, href }) => {
            const isActive = number === 2;
            return (
              <a
                key={number}
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  textDecoration: "none",
                  position: "relative",
                  background: isActive ? "var(--neutral-900)" : "none",
                  borderLeft: isActive ? "2px solid var(--color-teal)" : "2px solid transparent",
                  color: isActive ? "var(--neutral-200)" : "var(--neutral-600)",
                  transition: "background 150ms ease",
                }}
              >
                <Icon color={isActive ? "var(--color-teal)" : "var(--neutral-600)"} />
                <span style={{ fontSize: "var(--text-body-sm)", fontWeight: 500 }}>
                  {label}
                </span>
              </a>
            );
          })}
        </nav>

        {/* User row */}
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--neutral-700)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--neutral-300)",
            flexShrink: 0,
          }}>
            U
          </div>
          <span style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Your account
          </span>
          <button
            aria-label="Settings"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--neutral-600)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.2 3.2l1 1M11.8 11.8l1 1M3.2 12.8l1-1M11.8 4.2l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>

        {/* Sticky header */}
        <header style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          height: 64,
          background: "var(--color-white)",
          borderBottom: "1px solid var(--neutral-300)",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          gap: 16,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: "var(--text-h4)", fontWeight: 600, color: "var(--neutral-950)", marginRight: "auto" }}>
            Financials
          </span>
          <span style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-600)", fontWeight: 400 }}>
            Section {ACTIVE_MODULE_INDEX + 1} of {MODULE_ITEMS.length}
          </span>
          <ReadinessRingSmall pct={completionPct} />
          <button
            type="button"
            onClick={() => save(financials)}
            disabled={saving || loading}
            style={{
              background: "var(--color-teal)",
              color: "var(--color-white)",
              border: "none",
              borderRadius: 6,
              padding: "8px 18px",
              fontSize: "var(--text-body-sm)",
              fontWeight: 600,
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
              fontFamily: "inherit",
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </header>

        {/* Scrollable content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "40px 32px", background: "var(--neutral-100)" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
              <span style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)" }}>Loading your financials...</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>

              {/* ── LEFT COLUMN: Input area ─────────────────────────────── */}
              <div style={{ flex: "0 0 55%", minWidth: 0 }}>

                {/* Eyebrow */}
                <div style={{
                  fontSize: "var(--text-label)",
                  fontWeight: 600,
                  color: "var(--color-teal)",
                  letterSpacing: "var(--text-label-tracking)",
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}>
                  Startup Costs
                </div>

                {/* Lora editorial intro */}
                <p style={{
                  fontFamily: "Lora, Georgia, serif",
                  fontStyle: "italic",
                  fontSize: "var(--text-body-lg)",
                  lineHeight: "var(--text-body-lg-lh)",
                  color: "var(--neutral-700)",
                  maxWidth: 480,
                  marginBottom: 32,
                }}>
                  Most coffee shops spend between $80,000 and $300,000 to open. The range depends on your lease terms, equipment choices, and how much you&apos;re doing yourself.
                </p>

                {/* Three collapsible sections */}
                <div style={{
                  background: "var(--color-white)",
                  borderRadius: 8,
                  border: "1px solid var(--neutral-200)",
                  padding: "0 20px",
                }}>
                  {SECTION_CONFIGS.map((sec) => {
                    const lines = sectionLines(sec.categories);
                    const total = lines.reduce((s, l) => s + l.amount_cents, 0);

                    // Seed default items on first expand if empty
                    const seedDefaults = () => {
                      if (lines.length === 0) {
                        const defaultCategory = SECTION_DEFAULT_CATEGORY[sec.key];
                        sec.defaultItems.forEach(({ label }) => addStartupCostLine(defaultCategory, label));
                      }
                    };

                    return (
                      <FormSection
                        key={sec.key}
                        title={sec.label}
                        subtotalCents={total}
                        collapsed={collapsed[sec.key] ?? false}
                        onToggle={() => {
                          if (collapsed[sec.key]) seedDefaults();
                          setCollapsed((prev) => ({ ...prev, [sec.key]: !prev[sec.key] }));
                        }}
                        onAddLine={() => addStartupCostLine(SECTION_DEFAULT_CATEGORY[sec.key])}
                      >
                        {lines.length === 0 ? (
                          <p style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)", margin: "4px 0 8px" }}>
                            No items yet. Add the equipment you&apos;re budgeting for.
                          </p>
                        ) : (
                          lines.map((line) => (
                            <CostLineRow
                              key={line.id}
                              line={line}
                              onChange={updateStartupCostLine}
                              onRemove={removeStartupCostLine}
                            />
                          ))
                        )}
                      </FormSection>
                    );
                  })}
                </div>

                {/* Grand total */}
                {grandTotal > 0 && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: "2px solid var(--neutral-200)" }}>
                    <div style={{ fontSize: "var(--text-h3)", fontWeight: 700, color: "var(--neutral-950)", lineHeight: "var(--text-h3-lh)" }}>
                      Estimated startup cost: ${fmtDollars(grandTotal)}
                    </div>
                    <div style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-600)", marginTop: 4, fontWeight: 300 }}>
                      This is an estimate. Update as you get real quotes.
                    </div>
                  </div>
                )}
              </div>

              {/* ── RIGHT COLUMN: Live visualization ────────────────────── */}
              <div style={{ flex: "0 0 45%", minWidth: 0 }}>

                {/* Eyebrow */}
                <div style={{
                  fontSize: "var(--text-label)",
                  fontWeight: 600,
                  color: "var(--color-teal)",
                  letterSpacing: "var(--text-label-tracking)",
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}>
                  Cost Breakdown
                </div>

                <div style={{
                  background: "var(--color-white)",
                  borderRadius: 8,
                  border: "1px solid var(--neutral-200)",
                  padding: 20,
                  marginBottom: 20,
                }}>
                  <CostBreakdownChart
                    equipmentCents={equipmentCents}
                    leaseBuildoutCents={leaseBuildoutCents}
                    preOpeningCents={preOpeningCents}
                  />
                </div>

                {/* Three key metrics */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 16,
                }}>
                  {[
                    {
                      label: "Monthly rent",
                      value: monthlyRentCents > 0 ? `$${fmtDollars(monthlyRentCents)}` : "Not set",
                      tooltip: undefined as string | undefined,
                    },
                    {
                      label: "Break-even",
                      value: "—",
                      tooltip: "Add all costs to estimate break-even",
                    },
                    {
                      label: "Startup total",
                      value: grandTotal > 0 ? `$${fmtDollars(grandTotal)}` : "Not set",
                      tooltip: undefined as string | undefined,
                    },
                  ].map(({ label, value, tooltip }) => (
                    <div key={label}>
                      <div
                        title={tooltip}
                        style={{ fontSize: "var(--text-h3)", fontWeight: 700, color: "var(--neutral-950)", lineHeight: 1, cursor: tooltip ? "help" : undefined }}
                      >
                        {value}
                      </div>
                      <div style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-600)", marginTop: 4, fontWeight: 400 }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Co-pilot drawer */}
        <CoPilotDrawerInline planId={planId} />
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 48,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: "var(--text-body-sm)",
            fontWeight: 500,
            background: toast.type === "success" ? "var(--color-teal)" : "var(--color-danger)",
            color: "var(--color-white)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}
        >
          {toast.msg}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.8, marginLeft: 4 }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
