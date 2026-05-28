"use client";

// TIM-1244: Guided interview / wizard for first-time financial setup.
// Walks a first-time coffee shop owner through the essentials one question (or a
// tight cluster) at a time, in plain language, with a progress bar. Each step
// explains *why* it's asked. On finish, the answers are mapped back onto the
// existing MonthlyProjections so the detailed input page is pre-filled.

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X, Coffee, Plus, Trash2 } from "lucide-react";
import {
  type MonthlyProjections,
  type DayKey,
  type ForecastLine,
  type PersonnelLine,
  type FundingSourceLine,
  type StartupCosts,
  type AssetCategory,
  defaultStartupCosts,
} from "@/lib/financial-projection";

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_FULL: Record<DayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

// ── Wizard asset model ────────────────────────────────────────────────────────
// TIM-1254: capital assets entered in the wizard become capex ForecastLines.

interface WizardAsset {
  id: string;
  label: string;
  asset_category: AssetCategory;
  cost_cents: number;
  useful_life_years: number;
}

const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  build_out: "Build-Out & Renovation",
  equipment: "Equipment",
  pos_tech: "POS & Technology",
  furniture: "Furniture & Fixtures",
  vehicle: "Vehicle",
  other: "Other",
};

const DEFAULT_USEFUL_LIFE: Record<AssetCategory, number> = {
  build_out: 15,
  equipment: 7,
  pos_tech: 5,
  furniture: 10,
  vehicle: 5,
  other: 7,
};

// ── Answers ───────────────────────────────────────────────────────────────────
// A flat shape decoupled from MonthlyProjections. We seed it from the current
// model, edit it through the steps, and map it back in buildProjections().

interface Answers {
  daysOpen: Record<DayKey, boolean>;
  customersPerDay: number;
  avgTicketCents: number;
  cogsPct: number;
  baristaCount: number;
  baristaHourlyCents: number;
  baristaHoursPerWeek: number;
  hasManager: boolean;
  managerAnnualCents: number;
  rentCents: number;
  utilitiesCents: number;
  insuranceCents: number;
  marketingPct: number;
  startup: StartupCosts;
  // TIM-1254: per-asset capital items replace startup.buildout_cents / equipment_cents.
  wizardAssets: WizardAsset[];
  founderEquityCents: number;
  loanCents: number;
  loanTermMonths: number;
  loanRatePct: number;
  incomeTaxPct: number;
  salesTaxPct: number;
}

function findLine(lines: ForecastLine[], key: ForecastLine["legacy_key"]) {
  return lines.find((l) => l.legacy_key === key);
}

function seedWizardAssets(mp: MonthlyProjections): WizardAsset[] {
  // Prefer real persisted capex ForecastLines (not synthetic equipment-item mirrors).
  const capexLines = mp.forecast_lines.filter(
    (l) => l.category === "capex" && !l.linked_equipment_item_id && l.value > 0
  );
  if (capexLines.length > 0) {
    return capexLines.map((l) => ({
      id: l.id,
      label: l.label,
      asset_category: l.asset_category ?? "other",
      cost_cents: l.value,
      useful_life_years: l.useful_life_years ?? DEFAULT_USEFUL_LIFE[l.asset_category ?? "other"],
    }));
  }
  // Legacy migration: convert lump-sum startup_costs buckets to wizard assets.
  const sc = mp.startup_costs ?? defaultStartupCosts();
  const assets: WizardAsset[] = [];
  if (sc.buildout_cents > 0) {
    assets.push({
      id: "wizard:build_out",
      label: "Build-Out & Renovation",
      asset_category: "build_out",
      cost_cents: sc.buildout_cents,
      useful_life_years: sc.buildout_useful_life_years ?? 15,
    });
  }
  if (sc.equipment_cents > 0) {
    assets.push({
      id: "wizard:equipment",
      label: "Equipment",
      asset_category: "equipment",
      cost_cents: sc.equipment_cents,
      useful_life_years: sc.equipment_useful_life_years ?? 7,
    });
  }
  return assets;
}

function seedAnswers(mp: MonthlyProjections): Answers {
  const openFlows = DAY_KEYS.filter((d) => mp.weekly_schedule[d]?.open).map(
    (d) => mp.daily_flow[d] || 0
  );
  const avgFlow = openFlows.length
    ? Math.round(openFlows.reduce((a, b) => a + b, 0) / openFlows.length)
    : 100;

  const baristas =
    (mp.personnel ?? []).find((p) => p.id === "staff:baristas") ??
    (mp.personnel ?? []).find((p) => p.pay_basis === "hourly");
  const manager =
    (mp.personnel ?? []).find((p) => p.id === "staff:store-manager") ??
    (mp.personnel ?? []).find((p) => p.pay_basis === "annual" && /manager/i.test(p.role));

  const rent = findLine(mp.forecast_lines, "rent");
  const utilities = findLine(mp.forecast_lines, "utilities");
  const insurance = findLine(mp.forecast_lines, "insurance");
  const marketing = findLine(mp.forecast_lines, "marketing");

  const equity = (mp.funding_sources ?? [])
    .filter((s) => s.kind === "founder_equity")
    .reduce((a, s) => a + (s.amount_cents || 0), 0);
  const loanLine = (mp.funding_sources ?? []).find((s) => s.kind === "loan");
  // The seeded funding defaults ($15M founder / $10M loan) are placeholders that
  // would prefill absurd numbers for a first-time owner. Treat those exact
  // sentinels as "not set yet" and start from a realistic figure instead.
  const SEED_FOUNDER_CENTS = 1500000000;
  const SEED_LOAN_CENTS = 1000000000;
  const equityIsSeed = equity === SEED_FOUNDER_CENTS;
  const loanRaw = loanLine?.amount_cents ?? 0;
  const loanIsSeed = loanRaw === SEED_LOAN_CENTS;

  return {
    daysOpen: Object.fromEntries(
      DAY_KEYS.map((d) => [d, !!mp.weekly_schedule[d]?.open])
    ) as Record<DayKey, boolean>,
    customersPerDay: avgFlow,
    avgTicketCents: mp.avg_ticket_cents || 750,
    cogsPct: mp.cogs_pct || 30,
    baristaCount: baristas?.headcount ?? 2,
    baristaHourlyCents: baristas?.pay_basis === "hourly" ? baristas.pay_amount_cents : 1700,
    baristaHoursPerWeek: baristas?.hours_per_week ?? 28,
    hasManager: !!manager,
    managerAnnualCents: manager?.pay_basis === "annual" ? manager.pay_amount_cents : 4600000,
    rentCents: rent?.mode === "flat" ? rent.value : 450000,
    utilitiesCents: utilities?.mode === "flat" ? utilities.value : 60000,
    insuranceCents: insurance?.mode === "flat" ? insurance.value : 20000,
    marketingPct: marketing?.mode === "pct" ? marketing.value : 2,
    startup: { ...defaultStartupCosts(), ...(mp.startup_costs ?? {}) },
    // TIM-1254: seed wizard assets from existing capex ForecastLines (non-item-workspace),
    // falling back to the legacy buildout_cents / equipment_cents lump sums so no data is lost.
    wizardAssets: seedWizardAssets(mp),
    founderEquityCents: equity > 0 && !equityIsSeed ? equity : 5000000,
    loanCents: loanIsSeed ? 0 : loanRaw,
    loanTermMonths: loanLine?.term_months ?? 60,
    loanRatePct: loanLine?.annual_rate_pct ?? 6.5,
    incomeTaxPct: mp.income_tax_pct || 25,
    salesTaxPct: mp.sales_tax_pct || 0,
  };
}

function upsertOverhead(
  lines: ForecastLine[],
  key: NonNullable<ForecastLine["legacy_key"]>,
  label: string,
  mode: ForecastLine["mode"],
  value: number
): ForecastLine[] {
  const idx = lines.findIndex((l) => l.legacy_key === key);
  if (idx >= 0) {
    const copy = [...lines];
    copy[idx] = { ...copy[idx], mode, value };
    return copy;
  }
  return [
    ...lines,
    { id: `line:${key}`, label, category: "overhead", mode, value, legacy_key: key },
  ];
}

function applyStaffing(personnel: PersonnelLine[], a: Answers): PersonnelLine[] {
  let next = [...personnel];
  const bIdx = next.findIndex((p) => p.id === "staff:baristas");
  const barista: PersonnelLine = {
    id: "staff:baristas",
    role: "Baristas",
    headcount: Math.max(0, a.baristaCount),
    pay_basis: "hourly",
    pay_amount_cents: Math.max(0, a.baristaHourlyCents),
    hours_per_week: Math.max(0, a.baristaHoursPerWeek),
    benefits_pct: bIdx >= 0 ? next[bIdx].benefits_pct : 12,
    cost_category: bIdx >= 0 ? next[bIdx].cost_category : "overhead",
  };
  if (bIdx >= 0) next[bIdx] = { ...next[bIdx], ...barista };
  else next = [barista, ...next];

  const mIdx = next.findIndex((p) => p.id === "staff:store-manager");
  if (a.hasManager) {
    const mgr: PersonnelLine = {
      id: "staff:store-manager",
      role: "Store Manager",
      headcount: 1,
      pay_basis: "annual",
      pay_amount_cents: Math.max(0, a.managerAnnualCents),
      benefits_pct: mIdx >= 0 ? next[mIdx].benefits_pct : 18,
      cost_category: mIdx >= 0 ? next[mIdx].cost_category : "overhead",
    };
    if (mIdx >= 0) next[mIdx] = { ...next[mIdx], ...mgr };
    else next = [...next, mgr];
  } else if (mIdx >= 0) {
    next = next.filter((p) => p.id !== "staff:store-manager");
  }
  return next;
}

function applyFunding(sources: FundingSourceLine[], a: Answers): FundingSourceLine[] {
  let next = [...sources];
  const fIdx = next.findIndex((s) => s.id === "funding:founder" || s.kind === "founder_equity");
  const founder: FundingSourceLine = {
    id: fIdx >= 0 ? next[fIdx].id : "funding:founder",
    kind: "founder_equity",
    label: fIdx >= 0 ? next[fIdx].label : "Founder Equity",
    amount_cents: Math.max(0, a.founderEquityCents),
  };
  if (fIdx >= 0) next[fIdx] = { ...next[fIdx], ...founder };
  else next = [founder, ...next];

  const lIdx = next.findIndex((s) => s.id === "funding:loan" || s.kind === "loan");
  if (a.loanCents > 0) {
    const loan: FundingSourceLine = {
      id: lIdx >= 0 ? next[lIdx].id : "funding:loan",
      kind: "loan",
      label: lIdx >= 0 ? next[lIdx].label : "Bank Loan",
      amount_cents: Math.max(0, a.loanCents),
      term_months: Math.max(1, a.loanTermMonths),
      annual_rate_pct: Math.max(0, a.loanRatePct),
    };
    if (lIdx >= 0) next[lIdx] = { ...next[lIdx], ...loan };
    else next = [...next, loan];
  } else if (lIdx >= 0) {
    next = next.filter((s) => !(s.id === "funding:loan" || s.kind === "loan"));
  }
  return next;
}

function buildProjections(base: MonthlyProjections, a: Answers): MonthlyProjections {
  const weekly_schedule = { ...base.weekly_schedule };
  const daily_flow = { ...base.daily_flow };
  for (const d of DAY_KEYS) {
    weekly_schedule[d] = { ...weekly_schedule[d], open: a.daysOpen[d] };
    if (a.daysOpen[d]) daily_flow[d] = Math.max(0, a.customersPerDay);
  }

  let forecast_lines = [...base.forecast_lines];
  forecast_lines = upsertOverhead(forecast_lines, "rent", "Rent", "flat", a.rentCents);
  forecast_lines = upsertOverhead(forecast_lines, "utilities", "Utilities", "flat", a.utilitiesCents);
  forecast_lines = upsertOverhead(forecast_lines, "insurance", "Insurance", "flat", a.insuranceCents);
  forecast_lines = upsertOverhead(forecast_lines, "marketing", "Marketing", "pct", a.marketingPct);

  // TIM-1254: apply wizard capex assets as persisted ForecastLines.
  // Keep non-wizard capex lines (e.g. equipment-item mirrors, other capex the user added manually).
  // Replace any lines whose id appears in the wizard asset list.
  const wizardIds = new Set(a.wizardAssets.map((w) => w.id));
  forecast_lines = forecast_lines.filter(
    (l) => l.category !== "capex" || l.linked_equipment_item_id || !wizardIds.has(l.id)
  );
  // Also remove old wizard-generated lines by their id prefix in case the user cleared assets.
  forecast_lines = forecast_lines.filter(
    (l) => l.category !== "capex" || l.linked_equipment_item_id || !l.id.startsWith("wizard:")
  );
  for (const w of a.wizardAssets) {
    forecast_lines.push({
      id: w.id,
      label: w.label,
      category: "capex",
      mode: "flat",
      value: Math.max(0, w.cost_cents),
      useful_life_years: Math.max(1, w.useful_life_years),
      asset_category: w.asset_category,
    });
  }

  // TIM-1245: the wizard collects a single average sale. If the owner had the
  // beverage/food split on, keep the invariant (beverage + food === ticket) by
  // rescaling each side proportionally to the new total.
  const nextTicket = Math.max(0, a.avgTicketCents);
  const split = base.revenue_split_enabled === true;
  const priorTotal = (base.beverage_ticket_cents ?? 0) + (base.food_ticket_cents ?? 0);
  const beverage_ticket_cents = split
    ? priorTotal > 0
      ? Math.round(((base.beverage_ticket_cents ?? 0) / priorTotal) * nextTicket)
      : nextTicket
    : base.beverage_ticket_cents;
  const food_ticket_cents = split
    ? priorTotal > 0
      ? nextTicket - Math.round(((base.beverage_ticket_cents ?? 0) / priorTotal) * nextTicket)
      : 0
    : base.food_ticket_cents;

  return {
    ...base,
    weekly_schedule,
    daily_flow,
    avg_ticket_cents: nextTicket,
    beverage_ticket_cents,
    food_ticket_cents,
    cogs_pct: Math.max(0, a.cogsPct),
    personnel: applyStaffing(base.personnel ?? [], a),
    forecast_lines,
    funding_sources: applyFunding(base.funding_sources ?? [], a),
    // TIM-1254: zero the aggregate lump-sum buckets when wizard assets exist —
    // the per-asset capex ForecastLines above now drive depreciation instead.
    startup_costs: a.wizardAssets.length > 0
      ? { ...a.startup, buildout_cents: 0, equipment_cents: 0 }
      : a.startup,
    income_tax_pct: Math.max(0, a.incomeTaxPct),
    sales_tax_pct: Math.max(0, a.salesTaxPct),
  };
}

// ── Small inputs ──────────────────────────────────────────────────────────────

const inputCls =
  "w-full text-base border border-[#e0e0e0] rounded-lg px-3 py-2.5 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] transition-colors";

function MoneyField({
  cents,
  onChange,
  currency,
  placeholder,
  suffix,
}: {
  cents: number;
  onChange: (cents: number) => void;
  currency: string;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-[#6b6b6b] w-10 shrink-0">{currency}</span>
      <input
        type="number"
        min={0}
        step={1}
        className={inputCls}
        value={cents ? cents / 100 : ""}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)))
        }
      />
      {suffix && <span className="text-sm text-[#6b6b6b] shrink-0">{suffix}</span>}
    </div>
  );
}

function NumberField({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className={inputCls}
        value={Number.isFinite(value) && value !== 0 ? value : value === 0 ? "0" : ""}
        placeholder={placeholder}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
      {suffix && <span className="text-sm text-[#6b6b6b] shrink-0 whitespace-nowrap">{suffix}</span>}
    </div>
  );
}

function Why({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-xl border border-[#e5eef0] bg-[#f0f9f9] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#155e63] mb-1">
        Why we ask
      </p>
      <p className="text-sm text-[#2a4a4c] leading-relaxed">{children}</p>
    </div>
  );
}

function fmtMoney(cents: number, currency: string) {
  const dollars = Math.round(cents / 100);
  return `${currency} ${dollars.toLocaleString()}`;
}

// ── Wizard ────────────────────────────────────────────────────────────────────

interface Props {
  initialMp: MonthlyProjections;
  currencyCode: string;
  startStep?: number;
  onComplete: (next: MonthlyProjections) => void;
  onSkip: () => void;
  onClose: (currentStep: number) => void;
}

export function ForecastWizard({
  initialMp,
  currencyCode,
  startStep = 0,
  onComplete,
  onSkip,
  onClose,
}: Props) {
  const [answers, setAnswers] = useState<Answers>(() => seedAnswers(initialMp));
  const cur = currencyCode || "USD";

  // TIM-1254: state for the inline "add capital asset" form.
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [newAssetLabel, setNewAssetLabel] = useState("");
  const [newAssetCategory, setNewAssetCategory] = useState<AssetCategory>("equipment");
  const [newAssetCents, setNewAssetCents] = useState(0);
  const [newAssetLife, setNewAssetLife] = useState(DEFAULT_USEFUL_LIFE["equipment"]);

  function set<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }
  function setStartup(patch: Partial<StartupCosts>) {
    setAnswers((a) => ({ ...a, startup: { ...a.startup, ...patch } }));
  }
  function addWizardAsset() {
    if (!newAssetLabel.trim() || newAssetCents <= 0) return;
    const asset: WizardAsset = {
      id: `wizard:${Date.now()}`,
      label: newAssetLabel.trim(),
      asset_category: newAssetCategory,
      cost_cents: Math.max(0, Math.round(newAssetCents)),
      useful_life_years: Math.max(1, Math.round(newAssetLife)),
    };
    setAnswers((a) => ({ ...a, wizardAssets: [...a.wizardAssets, asset] }));
    setNewAssetLabel("");
    setNewAssetCents(0);
    setShowAddAsset(false);
  }
  function removeWizardAsset(id: string) {
    setAnswers((a) => ({ ...a, wizardAssets: a.wizardAssets.filter((w) => w.id !== id) }));
  }

  const openCount = DAY_KEYS.filter((d) => answers.daysOpen[d]).length;
  // TIM-1254: startup total = wizard capital assets + non-capital one-time costs.
  const startupTotal = useMemo(() => {
    const sc = answers.startup;
    const assetTotal = answers.wizardAssets.reduce((s, w) => s + w.cost_cents, 0);
    return (
      assetTotal +
      sc.deposits_cents +
      sc.licenses_cents +
      sc.pre_opening_marketing_cents +
      sc.initial_inventory_cents +
      sc.working_capital_reserve_cents +
      sc.opening_cash_buffer_cents
    );
  }, [answers.startup, answers.wizardAssets]);

  // Step definitions. The first (welcome) and last (review) are not questions.
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Welcome",
      body: (
        <div>
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#155e63]/10 mb-4">
            <Coffee className="w-7 h-7 text-[#155e63]" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">
            Let&apos;s map out your coffee shop&apos;s money
          </h2>
          <p className="text-[#6b6b6b] leading-relaxed">
            We&apos;ll walk through a handful of plain questions — your hours, your
            customers, your costs, and how you&apos;re funding it. No spreadsheets,
            no finance background needed. It takes about five minutes, and when
            you&apos;re done we&apos;ll fill in your full forecast for you.
          </p>
          <p className="text-[#6b6b6b] leading-relaxed mt-3">
            You can pause anytime and pick up where you left off, or skip straight
            to the detailed page.
          </p>
        </div>
      ),
    },
    {
      title: "Your week",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">
            Which days will you be open?
          </h2>
          <p className="text-sm text-[#6b6b6b] mb-4">Tap the days you plan to serve customers.</p>
          <div className="grid grid-cols-1 gap-2">
            {DAY_KEYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() =>
                  set("daysOpen", { ...answers.daysOpen, [d]: !answers.daysOpen[d] })
                }
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                  answers.daysOpen[d]
                    ? "border-[#155e63] bg-[#155e63]/5"
                    : "border-[#e0e0e0] bg-white hover:border-[#c0c0c0]"
                }`}
              >
                <span className="text-sm font-medium text-[#1a1a1a]">{DAY_FULL[d]}</span>
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-md border ${
                    answers.daysOpen[d]
                      ? "border-[#155e63] bg-[#155e63] text-white"
                      : "border-[#c0c0c0] bg-white"
                  }`}
                >
                  {answers.daysOpen[d] && <Check size={13} strokeWidth={3} />}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-[#afafaf] mt-3">
            Open {openCount} day{openCount !== 1 ? "s" : ""} a week. You can set exact opening
            hours later.
          </p>
          <Why>
            We only count sales on the days you&apos;re actually open. Fewer days means
            lower revenue but also lower staffing and utility costs — this keeps your
            forecast honest.
          </Why>
        </div>
      ),
    },
    {
      title: "Foot traffic",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">
            How many customers do you expect on a typical day?
          </h2>
          <p className="text-sm text-[#6b6b6b] mb-4">
            A rough average across your open days is perfect — you can fine-tune each
            day later.
          </p>
          <NumberField
            value={answers.customersPerDay}
            onChange={(n) => set("customersPerDay", Math.round(n))}
            min={0}
            max={2000}
            placeholder="100"
            suffix="customers / day"
          />
          <Why>
            Customers per day is the single biggest driver of your revenue. A new
            neighborhood cafe often starts around 80–150 customers a day and grows
            from there.
          </Why>
        </div>
      ),
    },
    {
      title: "Average sale",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">
            What does a typical customer spend?
          </h2>
          <p className="text-sm text-[#6b6b6b] mb-4">
            Your average sale per visit — one drink, or a drink plus a pastry.
          </p>
          <MoneyField
            cents={answers.avgTicketCents}
            onChange={(c) => set("avgTicketCents", c)}
            currency={cur}
            placeholder="7.50"
            suffix="per visit"
          />
          <Why>
            Customers per day multiplied by the average sale gives your daily revenue.
            Most espresso bars land between {cur} 6 and {cur} 10 per visit once you
            mix in food and a second drink.
          </Why>
        </div>
      ),
    },
    {
      title: "Cost of goods",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">
            How much of each sale goes to ingredients?
          </h2>
          <p className="text-sm text-[#6b6b6b] mb-4">
            The cost of the coffee, milk, cups, and syrups in what you sell — as a
            percentage of the sale price.
          </p>
          <NumberField
            value={answers.cogsPct}
            onChange={(n) => set("cogsPct", n)}
            min={0}
            max={100}
            step={1}
            placeholder="30"
            suffix="% of each sale"
          />
          <Why>
            This is your &quot;cost of goods sold.&quot; It&apos;s what&apos;s left
            after ingredients that pays for rent, staff, and your own take-home. A
            well-run coffee shop keeps this around 28–35%.
          </Why>
        </div>
      ),
    },
    {
      title: "Your team",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">Who&apos;s behind the counter?</h2>
          <p className="text-sm text-[#6b6b6b] mb-4">Start with your baristas.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                Number of baristas
              </label>
              <NumberField
                value={answers.baristaCount}
                onChange={(n) => set("baristaCount", Math.max(0, Math.round(n)))}
                min={0}
                max={50}
                placeholder="2"
                suffix="people"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                Average pay per barista
              </label>
              <MoneyField
                cents={answers.baristaHourlyCents}
                onChange={(c) => set("baristaHourlyCents", c)}
                currency={cur}
                placeholder="17.00"
                suffix="/ hour"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                Hours each barista works per week
              </label>
              <NumberField
                value={answers.baristaHoursPerWeek}
                onChange={(n) => set("baristaHoursPerWeek", Math.max(0, Math.round(n)))}
                min={0}
                max={60}
                placeholder="28"
                suffix="hrs / week"
              />
            </div>
            <div className="pt-2 border-t border-[#f0f0f0]">
              <label className="block text-xs font-medium text-[#6b6b6b] mb-2">
                Will you have a salaried manager?
              </label>
              <div className="flex gap-2">
                {[
                  { v: true, label: "Yes" },
                  { v: false, label: "Not at first" },
                ].map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    onClick={() => set("hasManager", opt.v)}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                      answers.hasManager === opt.v
                        ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63]"
                        : "border-[#e0e0e0] bg-white text-[#6b6b6b] hover:border-[#c0c0c0]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {answers.hasManager && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                    Manager salary
                  </label>
                  <MoneyField
                    cents={answers.managerAnnualCents}
                    onChange={(c) => set("managerAnnualCents", c)}
                    currency={cur}
                    placeholder="46000"
                    suffix="/ year"
                  />
                </div>
              )}
            </div>
          </div>
          <Why>
            Staff is usually the largest cost in a coffee shop. We add a payroll
            cushion for taxes and benefits automatically — you can adjust roles and
            hiring dates on the Salaries page.
          </Why>
        </div>
      ),
    },
    {
      title: "Rent",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">
            What&apos;s your monthly rent?
          </h2>
          <p className="text-sm text-[#6b6b6b] mb-4">
            Your base lease payment for the space, each month.
          </p>
          <MoneyField
            cents={answers.rentCents}
            onChange={(c) => set("rentCents", c)}
            currency={cur}
            placeholder="4500"
            suffix="/ month"
          />
          <Why>
            Rent is a fixed cost — you owe it whether you sell one cup or a thousand.
            Keeping it sensible relative to your sales is one of the biggest factors
            in whether a shop survives.
          </Why>
        </div>
      ),
    },
    {
      title: "Other overhead",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">A few more monthly bills</h2>
          <p className="text-sm text-[#6b6b6b] mb-4">
            Rough monthly estimates are fine. We&apos;ve pre-filled typical amounts.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                Utilities (power, water, internet)
              </label>
              <MoneyField
                cents={answers.utilitiesCents}
                onChange={(c) => set("utilitiesCents", c)}
                currency={cur}
                placeholder="600"
                suffix="/ month"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                Insurance
              </label>
              <MoneyField
                cents={answers.insuranceCents}
                onChange={(c) => set("insuranceCents", c)}
                currency={cur}
                placeholder="200"
                suffix="/ month"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                Marketing
              </label>
              <NumberField
                value={answers.marketingPct}
                onChange={(n) => set("marketingPct", Math.max(0, n))}
                min={0}
                max={20}
                step={0.5}
                placeholder="2"
                suffix="% of sales"
              />
            </div>
          </div>
          <Why>
            These run in the background every month. Setting them as a percentage of
            sales (like marketing) means they scale naturally as you grow. You can
            add more line items — like software or repairs — on the input page.
          </Why>
        </div>
      ),
    },
    {
      // TIM-1254: unified capital-asset step replaces the two lump-sum fields.
      title: "Capital assets",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">
            What are you buying to open?
          </h2>
          <p className="text-sm text-[#6b6b6b] mb-4">
            Add each capital item once: build-out, equipment, fixtures. You can edit
            costs and useful lives on the Costs &amp; Expenses page anytime.
          </p>

          {/* Asset list */}
          <div className="space-y-2 mb-3">
            {answers.wizardAssets.length === 0 && (
              <p className="text-xs text-[#afafaf] text-center py-3 rounded-xl border border-dashed border-[#e0e0e0]">
                No assets added yet. Use the button below to add your first item.
              </p>
            )}
            {answers.wizardAssets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center gap-2 rounded-xl border border-[#e8f0f0] bg-[#f4f9f8] px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[#1a1a1a] block truncate">
                    {asset.label}
                  </span>
                  <span className="text-xs text-[#6b6b6b]">
                    {ASSET_CATEGORY_LABELS[asset.asset_category]} &middot; {asset.useful_life_years}yr life
                  </span>
                </div>
                <span className="text-sm font-semibold text-[#1a1a1a] shrink-0">
                  {fmtMoney(asset.cost_cents, cur)}
                </span>
                <button
                  type="button"
                  onClick={() => removeWizardAsset(asset.id)}
                  className="text-[#afafaf] hover:text-red-500 transition-colors shrink-0"
                  aria-label={`Remove ${asset.label}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add asset form */}
          {showAddAsset ? (
            <div className="rounded-xl border border-[#155e63]/30 bg-white p-3 space-y-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Asset name</label>
                <input
                  type="text"
                  className={inputCls}
                  value={newAssetLabel}
                  onChange={(e) => setNewAssetLabel(e.target.value)}
                  placeholder="Espresso machine, bar build-out…"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Type</label>
                  <select
                    className={inputCls}
                    value={newAssetCategory}
                    onChange={(e) => {
                      const cat = e.target.value as AssetCategory;
                      setNewAssetCategory(cat);
                      setNewAssetLife(DEFAULT_USEFUL_LIFE[cat]);
                    }}
                  >
                    {(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map((cat) => (
                      <option key={cat} value={cat}>{ASSET_CATEGORY_LABELS[cat]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Useful life (years)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className={inputCls}
                    value={newAssetLife || ""}
                    onChange={(e) => setNewAssetLife(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6b6b6b] mb-1">Cost ({cur})</label>
                <MoneyField
                  cents={newAssetCents}
                  onChange={(c) => setNewAssetCents(c)}
                  currency={cur}
                  placeholder="50000"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={addWizardAsset}
                  disabled={!newAssetLabel.trim() || newAssetCents <= 0}
                  className="flex-1 text-sm font-semibold text-white bg-[#155e63] disabled:opacity-40 hover:bg-[#124e52] rounded-lg px-4 py-2 transition-colors"
                >
                  Add asset
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddAsset(false); setNewAssetLabel(""); setNewAssetCents(0); }}
                  className="text-sm text-[#6b6b6b] hover:text-[#1a1a1a] border border-[#e0e0e0] rounded-lg px-4 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddAsset(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-[#155e63] hover:text-[#124e52] border border-dashed border-[#155e63]/40 rounded-xl px-4 py-2 w-full justify-center transition-colors mb-3"
            >
              <Plus size={15} /> Add a capital asset
            </button>
          )}

          {/* Opening cash cushion */}
          <div className="pt-3 border-t border-[#f0f0f0]">
            <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
              Opening cash cushion (to cover the first slow months)
            </label>
            <MoneyField
              cents={answers.startup.opening_cash_buffer_cents}
              onChange={(c) => setStartup({ opening_cash_buffer_cents: c })}
              currency={cur}
              placeholder="10000"
            />
          </div>

          <p className="text-xs text-[#afafaf] mt-3">
            Estimated to open:{" "}
            <span className="font-semibold text-[#6b6b6b]">{fmtMoney(startupTotal, cur)}</span>{" "}
            (includes deposits, permits, and starting inventory you can adjust on the Startup Costs page).
          </p>
          <Why>
            Enter each capital asset once here. It drives the cash outflow on day one,
            depreciates over its useful life on the P&amp;L, and shows on your balance sheet.
            No need to enter the same item in multiple places.
          </Why>
        </div>
      ),
    },
    {
      title: "Funding",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">
            How are you paying for it?
          </h2>
          <p className="text-sm text-[#6b6b6b] mb-4">
            The money you&apos;re putting in, plus any loan.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                Your own money (and any investors)
              </label>
              <MoneyField
                cents={answers.founderEquityCents}
                onChange={(c) => set("founderEquityCents", c)}
                currency={cur}
                placeholder="50000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                Loan amount (leave at 0 if none)
              </label>
              <MoneyField
                cents={answers.loanCents}
                onChange={(c) => set("loanCents", c)}
                currency={cur}
                placeholder="0"
              />
            </div>
            {answers.loanCents > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                    Loan length
                  </label>
                  <NumberField
                    value={answers.loanTermMonths}
                    onChange={(n) => set("loanTermMonths", Math.max(1, Math.round(n)))}
                    min={1}
                    max={360}
                    suffix="months"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6b6b] mb-1">
                    Interest rate
                  </label>
                  <NumberField
                    value={answers.loanRatePct}
                    onChange={(n) => set("loanRatePct", Math.max(0, n))}
                    min={0}
                    max={50}
                    step={0.1}
                    suffix="% / year"
                  />
                </div>
              </div>
            )}
          </div>
          <div
            className={`mt-4 rounded-xl border px-4 py-3 ${
              answers.founderEquityCents + answers.loanCents >= startupTotal
                ? "border-green-200 bg-green-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className="text-sm font-medium text-[#1a1a1a]">
              {answers.founderEquityCents + answers.loanCents >= startupTotal
                ? "That covers your opening costs."
                : `You're ${fmtMoney(
                    startupTotal - answers.founderEquityCents - answers.loanCents,
                    cur
                  )} short of your ${fmtMoney(startupTotal, cur)} opening costs.`}
            </p>
          </div>
          <Why>
            Your funding has to cover everything it takes to open, plus a cushion for
            the early months before sales catch up. We&apos;ll flag a gap so there
            are no surprises.
          </Why>
        </div>
      ),
    },
    {
      title: "Taxes",
      body: (
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-1">
            One last thing — taxes
          </h2>
          <p className="text-sm text-[#6b6b6b] mb-1">
            <strong>Income tax</strong> — the share of profit you set aside. If
            you&apos;re not sure, the default is a safe starting point.
          </p>
          <NumberField
            value={answers.incomeTaxPct}
            onChange={(n) => set("incomeTaxPct", Math.max(0, n))}
            min={0}
            max={60}
            placeholder="25"
            suffix="% of profit"
          />
          <p className="text-sm text-[#6b6b6b] mb-1 mt-4">
            <strong>Sales tax</strong> — what you collect from customers and remit
            to the state. It doesn&apos;t change your revenue or profit. Set your
            local rate, or leave 0% if none.
          </p>
          <NumberField
            value={answers.salesTaxPct}
            onChange={(n) => set("salesTaxPct", Math.max(0, n))}
            min={0}
            max={20}
            placeholder="0"
            suffix="% of sales"
          />
          <Why>
            Income tax is a cost — you only pay it when the shop is profitable, and
            only on the profit, not on every sale. Sales tax is different: you
            collect it on top of your prices and pass it straight through to the
            state, so it never counts as your income.
          </Why>
        </div>
      ),
    },
    {
      title: "All set",
      body: (
        <div>
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-green-100 mb-4">
            <Check className="w-7 h-7 text-green-600" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">
            You&apos;re ready to see your forecast
          </h2>
          <p className="text-[#6b6b6b] leading-relaxed mb-4">
            Here&apos;s the shape of your plan. We&apos;ll fill in your detailed
            inputs from these answers — you can refine anything afterward.
          </p>
          <div className="rounded-xl border border-[#efefef] bg-[#faf9f7] divide-y divide-[#efefef]">
            {[
              { k: "Open days", v: `${openCount} / week` },
              { k: "Customers per day", v: `${answers.customersPerDay}` },
              { k: "Average sale", v: fmtMoney(answers.avgTicketCents, cur) },
              { k: "Cost of goods", v: `${answers.cogsPct}%` },
              {
                k: "Team",
                v: `${answers.baristaCount} barista${answers.baristaCount !== 1 ? "s" : ""}${
                  answers.hasManager ? " + manager" : ""
                }`,
              },
              { k: "Rent", v: `${fmtMoney(answers.rentCents, cur)} / mo` },
              {
                k: "Capital assets",
                v: answers.wizardAssets.length > 0
                  ? `${answers.wizardAssets.length} asset${answers.wizardAssets.length !== 1 ? "s" : ""} · ${fmtMoney(answers.wizardAssets.reduce((s, w) => s + w.cost_cents, 0), cur)}`
                  : "None added",
              },
              { k: "Total to open", v: fmtMoney(startupTotal, cur) },
              {
                k: "Funding",
                v: fmtMoney(answers.founderEquityCents + answers.loanCents, cur),
              },
            ].map((row) => (
              <div key={row.k} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-[#6b6b6b]">{row.k}</span>
                <span className="text-sm font-semibold text-[#1a1a1a]">{row.v}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  const total = steps.length;
  const [step, setStep] = useState(() => Math.min(Math.max(0, startStep), total - 1));
  const isLast = step === total - 1;
  const isFirst = step === 0;
  const progressPct = Math.round(((step + 1) / total) * 100);

  function next() {
    if (isLast) {
      onComplete(buildProjections(initialMp, answers));
    } else {
      setStep((s) => Math.min(total - 1, s + 1));
    }
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-[#1a1a1a]/40 backdrop-blur-sm p-0 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Guided financial setup"
    >
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-xl flex flex-col min-h-screen sm:min-h-0 sm:max-h-[92vh]">
        {/* Header + progress */}
        <div className="px-6 pt-5 pb-4 border-b border-[#f0f0f0]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#155e63]">
              Guided Setup
            </p>
            <button
              type="button"
              onClick={() => onClose(step)}
              className="text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
              aria-label="Pause and close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-[#6b6b6b]">
              Step {step + 1} of {total} · {steps[step].title}
            </span>
            <span className="text-xs text-[#afafaf]">{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#f0f0f0] overflow-hidden">
            <div
              className="h-full bg-[#155e63] rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 flex-1 overflow-y-auto">{steps[step].body}</div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#f0f0f0] flex items-center justify-between gap-3">
          <div>
            {!isFirst ? (
              <button
                type="button"
                onClick={back}
                className="flex items-center gap-1.5 text-sm font-medium text-[#6b6b6b] hover:text-[#1a1a1a] px-3 py-2 rounded-lg transition-colors"
              >
                <ArrowLeft size={15} /> Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onSkip}
                className="text-sm font-medium text-[#afafaf] hover:text-[#6b6b6b] px-3 py-2 rounded-lg transition-colors"
              >
                Skip setup
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#155e63] hover:bg-[#124e52] px-5 py-2.5 rounded-lg transition-colors"
          >
            {isLast ? (
              <>
                Fill in my forecast <Check size={16} />
              </>
            ) : isFirst ? (
              <>
                Let&apos;s go <ArrowRight size={16} />
              </>
            ) : (
              <>
                Next <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
