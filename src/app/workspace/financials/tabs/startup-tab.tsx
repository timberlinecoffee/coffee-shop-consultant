"use client";

import { type ForecastLine, type FundingSourceLine, type StartupCosts, fmt } from "@/lib/financial-projection";
import { NumericInput } from "@/components/ui/numeric-input";

interface Props {
  startupCosts: StartupCosts;
  // TIM-1258: Equipment total sourced from Equipment & Supplies workspace.
  equipmentTotalCents: number;
  hasEquipmentItems: boolean;
  // TIM-1254b: per-asset capex display in the Capital Assets section.
  capexLines?: ForecastLine[];
  equipmentItemLines?: ForecastLine[];
  fundingSources?: FundingSourceLine[];
  currencyCode?: string;
  canEdit: boolean;
  onUpdateField: (key: keyof StartupCosts, cents: number) => void;
}

// One-time costs the owner enters directly. Build-Out & Capital Assets are
// handled in the Capital Assets section above; these are the non-capex items.
const EDITABLE_FIELDS: { key: keyof StartupCosts; label: string; hint?: string }[] = [
  { key: "startup_supplies_cents", label: "Startup Supplies & Smallwares", hint: "Cups, lids, smallwares, cleaning, packaging: the consumables you open with" },
  { key: "initial_inventory_cents", label: "Initial Inventory", hint: "Opening coffee, food, and retail stock" },
  { key: "deposits_cents", label: "Deposits (Rent, Utilities)", hint: "Refundable deposits held by your landlord and utilities" },
  { key: "licenses_cents", label: "Licenses & Permits", hint: "Business license, food service, health and signage permits" },
  { key: "professional_fees_cents", label: "Professional & Legal Fees", hint: "Entity formation, attorney, accountant and bookkeeping setup" },
  { key: "pre_opening_marketing_cents", label: "Pre-Opening Marketing", hint: "Sign, launch promo, grand-opening spend before day one" },
  { key: "working_capital_reserve_cents", label: "Working Capital Reserve", hint: "Cushion: 3-6 months of fixed costs (stays in the bank)" },
  { key: "opening_cash_buffer_cents", label: "Opening Cash Buffer", hint: "Extra cash on hand for the first slow months" },
];

interface CapexRow {
  key: string;
  label: string;
  valueCents: number;
  lifeYears: number;
  fromWorkspace: boolean;
  legacy: boolean;
  assetCategory?: string;
}

// Display labels for workspace asset categories (TIM-1246b)
const ASSET_CATEGORY_LABELS: Record<string, string> = {
  build_out: "Build-Out & Renovation",
  equipment: "Equipment",
  pos_tech: "POS & Technology",
  furniture: "Furniture & Fixtures",
  vehicle: "Vehicles",
  other: "Other Capital Assets",
};

interface WorkspaceCategoryGroup {
  cat: string;
  label: string;
  totalCents: number;
  count: number;
  avgLifeYears: number;
}

export function StartupTab({
  startupCosts,
  equipmentTotalCents,
  hasEquipmentItems,
  capexLines,
  equipmentItemLines,
  fundingSources,
  currencyCode = "USD",
  canEdit,
  onUpdateField,
}: Props) {
  const f = (v: number) => fmt(v, currencyCode);

  // ── Capital Assets section ──────────────────────────────────────────────────
  const realCapexLines = (capexLines ?? []).filter(
    (l) => l.category === "capex" && !l.linked_equipment_item_id
  );
  const itemCapexLines = equipmentItemLines ?? [];
  const hasPerAssetData = realCapexLines.length > 0 || itemCapexLines.length > 0;

  // Legacy migration: buildout_cents or equipment_cents present but no per-asset capex yet.
  const legacyBuildout = startupCosts.buildout_cents ?? 0;
  const legacyEquipment = startupCosts.equipment_cents ?? 0;
  const hasLegacyLumpSums = (legacyBuildout > 0 || legacyEquipment > 0) && !hasPerAssetData;

  const capexRows: CapexRow[] = [];
  if (hasPerAssetData) {
    for (const l of realCapexLines) {
      capexRows.push({
        key: l.id,
        label: l.label,
        valueCents: l.value,
        lifeYears: l.useful_life_years ?? 7,
        fromWorkspace: false,
        legacy: false,
      });
    }
    for (const l of itemCapexLines) {
      capexRows.push({
        key: l.id,
        label: l.label,
        valueCents: l.value,
        lifeYears: l.useful_life_years ?? 7,
        fromWorkspace: true,
        legacy: false,
        assetCategory: l.asset_category ?? "other",
      });
    }
  } else if (hasLegacyLumpSums) {
    if (legacyBuildout > 0) {
      capexRows.push({
        key: "legacy:buildout",
        label: "Build-Out & Renovation",
        valueCents: legacyBuildout,
        lifeYears: startupCosts.buildout_useful_life_years ?? 15,
        fromWorkspace: false,
        legacy: true,
      });
    }
    if (legacyEquipment > 0) {
      capexRows.push({
        key: "legacy:equipment",
        label: "Equipment",
        valueCents: legacyEquipment,
        lifeYears: startupCosts.equipment_useful_life_years ?? 7,
        fromWorkspace: false,
        legacy: true,
      });
    }
  }

  const totalCapital = capexRows.reduce((sum, r) => sum + r.valueCents, 0);

  // TIM-1246b: workspace items grouped into category summaries; standalone/legacy rows listed individually.
  const standaloneCapexRows = capexRows.filter((r) => !r.fromWorkspace);
  const workspaceCapexRows = capexRows.filter((r) => r.fromWorkspace);
  const workspaceCategoryMap = new Map<string, WorkspaceCategoryGroup>();
  for (const row of workspaceCapexRows) {
    const cat = row.assetCategory ?? "other";
    const existing = workspaceCategoryMap.get(cat);
    if (existing) {
      const newCount = existing.count + 1;
      existing.totalCents += row.valueCents;
      existing.avgLifeYears = Math.round((existing.avgLifeYears * existing.count + row.lifeYears) / newCount);
      existing.count = newCount;
    } else {
      workspaceCategoryMap.set(cat, {
        cat,
        label: ASSET_CATEGORY_LABELS[cat] ?? "Other Capital Assets",
        totalCents: row.valueCents,
        count: 1,
        avgLifeYears: row.lifeYears,
      });
    }
  }
  const workspaceCategoryGroups = Array.from(workspaceCategoryMap.values());

  // ── Editable one-time costs ─────────────────────────────────────────────────
  const editableTotal = EDITABLE_FIELDS.reduce(
    (sum, fld) => sum + (startupCosts[fld.key] as number),
    0
  );

  // When there are no per-asset capex rows and no legacy lump sums, still include
  // the equipment total from the workspace (if items exist) for the grand total.
  const equipmentFallbackCents =
    hasPerAssetData || hasLegacyLumpSums ? 0 : equipmentTotalCents;

  const totalStartup = totalCapital + editableTotal + equipmentFallbackCents;
  const nothingEntered = totalStartup === 0;

  // ── Funding sources ─────────────────────────────────────────────────────────
  const sources = fundingSources ?? [];
  const sumKind = (kind: FundingSourceLine["kind"]) =>
    sources.filter((s) => s.kind === kind).reduce((acc, s) => acc + (s.amount_cents || 0), 0);

  const founderTotal = sumKind("founder_equity");
  const investorTotal = sumKind("investor_equity");
  const grantTotal = sumKind("grant");
  const loanLines = sources.filter((s) => s.kind === "loan" && s.amount_cents > 0);
  const loanTotal = loanLines.reduce((acc, l) => acc + l.amount_cents, 0);
  const totalFunding = founderTotal + investorTotal + grantTotal + loanTotal;
  const fundingGap = totalStartup - totalFunding;

  const monthlyPaymentFor = (line: FundingSourceLine) => {
    const p = line.amount_cents;
    const n = Math.max(0, line.term_months ?? 0);
    const r = ((line.annual_rate_pct ?? 0) / 100) / 12;
    if (p <= 0 || n <= 0) return 0;
    if (r <= 0) return Math.round(p / n);
    return Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  };
  const totalMonthlyLoanPayment = loanLines.reduce((acc, l) => acc + monthlyPaymentFor(l), 0);

  const inputCls =
    "w-32 text-sm text-right border border-[var(--border-medium)] rounded-lg px-3 py-1.5 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";

  return (
    <div className="space-y-4">
      {/* Equipment-first guidance — only when nothing entered at all */}
      {nothingEntered && (
        <div className="rounded-xl border border-[var(--teal)]/20 bg-[var(--teal)]/5 px-5 py-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">Start with your equipment.</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">
            Your espresso machine, grinders, fridge and POS are usually the biggest part of
            opening. Build them in the Equipment &amp; Supplies workspace and they flow in
            here automatically — then fill in the rest below. Your total builds up from what
            you actually need, one line at a time.
          </p>
          <a
            href="/workspace/buildout-equipment"
            className="mt-3 inline-block text-xs font-semibold text-white bg-[var(--teal)] rounded-lg px-4 py-2 hover:bg-[var(--teal-deep)] transition-colors"
          >
            Add your equipment →
          </a>
        </div>
      )}

      {/* Legacy migration hint — shown when only lump-sum data exists */}
      {hasLegacyLumpSums && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">Upgrade to per-asset tracking</p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            Your build-out and equipment are saved as lump sums. Add individual assets in the{" "}
            <a href="/workspace/buildout-equipment" className="font-semibold underline">
              Equipment &amp; Supplies workspace
            </a>{" "}
            and each asset will appear here with its own depreciation schedule.
          </p>
        </div>
      )}

      {/* Startup cost table */}
      {/* tour-startup-capital-assets is on this always-rendered card so the guided tour
          lands even when a new user has no capex lines yet (TIM-1267) */}
      <div id="tour-startup-capital-assets" className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <p className="text-base font-bold text-[var(--foreground)] leading-tight">What It Takes To Open The Door</p>
          <p className="text-xs text-[var(--dark-grey)] mt-0.5">
            Enter each one-time cost below. The total adds itself up as you go.
          </p>
        </div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {/* Capital Assets section — read-only, sourced */}
            {(capexRows.length > 0 || !hasLegacyLumpSums) && (
              <tr className="border-t border-[var(--neutral-cool-150)] bg-[var(--neutral-cool-50)]">
                <td className="py-2 pl-5 pr-4" colSpan={2}>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--dark-grey)]">
                    Capital Assets
                  </span>
                  {hasPerAssetData && (
                    <a
                      href="/workspace/buildout-equipment"
                      className="ml-2 text-[10px] font-medium text-[var(--teal)] hover:underline"
                    >
                      {hasEquipmentItems ? "Edit in Equipment & Supplies →" : "Add in Equipment & Supplies →"}
                    </a>
                  )}
                </td>
              </tr>
            )}

            {/* Workspace items — one summary row per asset category (TIM-1246b) */}
            {workspaceCategoryGroups.map((group) => (
              <tr key={`ws-cat:${group.cat}`} className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-8 pr-4">
                  <span className="text-[var(--foreground)]">{group.label}</span>
                  <p className="text-[10px] text-[var(--dark-grey)] mt-0.5">
                    {group.count} {group.count === 1 ? "item" : "items"} · {group.avgLifeYears}yr avg life · straight-line ·{" "}
                    <a href="/workspace/buildout-equipment" className="text-[var(--teal)] hover:underline">
                      View in Equipment &amp; Supplies
                    </a>
                  </p>
                </td>
                <td className="py-3 pr-5 text-right font-medium align-top text-[var(--foreground)]">
                  {f(group.totalCents)}
                </td>
              </tr>
            ))}

            {/* Standalone capex rows (manually-entered in the planner, or legacy lump-sums) */}
            {standaloneCapexRows.map((row) => (
              <tr key={row.key} className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-8 pr-4">
                  <span className="text-[var(--foreground)]">{row.label}</span>
                  <p className="text-[10px] text-[var(--dark-grey)] mt-0.5">
                    {row.lifeYears}yr life · straight-line depreciation
                    {row.legacy && " · lump sum (add assets to switch to per-asset tracking)"}
                  </p>
                </td>
                <td className="py-3 pr-5 text-right font-medium align-top text-[var(--foreground)]">
                  {f(row.valueCents)}
                </td>
              </tr>
            ))}

            {/* When no capex rows and no legacy data but equipment items exist,
                show the equipment workspace total as a sourced row */}
            {!hasPerAssetData && !hasLegacyLumpSums && equipmentTotalCents > 0 && (
              <tr className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-8 pr-4">
                  <span className="text-[var(--foreground)]">Equipment</span>
                  <a
                    href="/workspace/buildout-equipment"
                    className="ml-2 text-xs font-medium text-[var(--teal)] hover:underline"
                  >
                    {hasEquipmentItems ? "Edit in Equipment & Supplies →" : "Add in Equipment & Supplies →"}
                  </a>
                  <p className="text-[10px] text-[var(--dark-grey)] mt-0.5">
                    {hasEquipmentItems
                      ? "From your Equipment & Supplies plan"
                      : "Entered once in Equipment & Supplies, flows in here automatically"}
                  </p>
                </td>
                <td className="py-3 pr-5 text-right font-medium align-top">{f(equipmentTotalCents)}</td>
              </tr>
            )}

            {capexRows.length === 0 && !hasLegacyLumpSums && equipmentTotalCents === 0 && (
              <tr className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-8 pr-4 text-[var(--dark-grey)]" colSpan={2}>
                  No capital assets yet. Add equipment and build-out items in the Equipment &amp; Supplies workspace.
                </td>
              </tr>
            )}

            {/* Everything else — entered right here */}
            {EDITABLE_FIELDS.map((fld) => (
              <tr key={fld.key} className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-5 pr-4">
                  <label htmlFor={`startup-${fld.key}`} className="text-[var(--foreground)]">
                    {fld.label}
                  </label>
                  {fld.hint && <p className="text-[10px] text-[var(--dark-grey)] mt-0.5">{fld.hint}</p>}
                </td>
                <td className="py-3 pr-5 text-right align-top">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs text-[var(--dark-grey)]">{currencyCode}</span>
                    <NumericInput
                      id={`startup-${fld.key}`}
                      className={inputCls}
                      type="number"
                      min={0}
                      step={100}
                      value={(startupCosts[fld.key] as number) ? (startupCosts[fld.key] as number) / 100 : ""}
                      onChange={(e) => onUpdateField(fld.key, (parseFloat(e.target.value) || 0) * 100)}
                      placeholder="0"
                      disabled={!canEdit}
                    />
                  </div>
                </td>
              </tr>
            ))}

            <tr className="border-t-2 border-[var(--teal)] bg-[var(--teal-tint-50)]">
              <td className="py-3 pl-5 pr-4 font-semibold">Total Startup Cost</td>
              <td className="py-3 pr-5 text-right font-bold text-lg">{f(totalStartup)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Funding sources — edited in the Funding tab, reflected here */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2 flex items-baseline justify-between">
          <p className="text-base font-bold text-[var(--foreground)] leading-tight">Funding Sources</p>
          <p className="text-xs text-[var(--dark-grey)]">Edit in the Funding tab</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {founderTotal > 0 && (
              <tr className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-5 pr-4 text-[var(--foreground)]">Founder Equity</td>
                <td className="py-3 pr-5 text-right font-medium">{f(founderTotal)}</td>
              </tr>
            )}
            {investorTotal > 0 && (
              <tr className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-5 pr-4 text-[var(--foreground)]">Investor Equity</td>
                <td className="py-3 pr-5 text-right font-medium">{f(investorTotal)}</td>
              </tr>
            )}
            {grantTotal > 0 && (
              <tr className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-5 pr-4 text-[var(--foreground)]">Grants / Other</td>
                <td className="py-3 pr-5 text-right font-medium">{f(grantTotal)}</td>
              </tr>
            )}
            {loanLines.map((l) => (
              <tr key={l.id} className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-5 pr-4 text-[var(--foreground)]">
                  {l.label}
                  <span className="ml-2 text-xs text-[var(--dark-grey)]">
                    ({l.term_months ?? 0} mo @ {l.annual_rate_pct ?? 0}% : {f(monthlyPaymentFor(l))}/mo)
                  </span>
                </td>
                <td className="py-3 pr-5 text-right font-medium">{f(l.amount_cents)}</td>
              </tr>
            ))}
            {totalFunding === 0 && (
              <tr className="border-t border-[var(--neutral-cool-150)]">
                <td className="py-3 pl-5 pr-4 text-[var(--dark-grey)]" colSpan={2}>
                  No funding sources yet — add how you&apos;ll pay for it in the Funding tab.
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-[var(--teal)] bg-[var(--teal-tint-50)]">
              <td className="py-3 pl-5 pr-4 font-semibold">Total Funding</td>
              <td className="py-3 pr-5 text-right font-bold">{f(totalFunding)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Funding gap */}
      {!nothingEntered && (
        <div
          className={`rounded-xl border px-5 py-4 ${
            fundingGap <= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className={`text-sm font-semibold ${
                  fundingGap <= 0 ? "text-green-800" : "text-red-800"
                }`}
              >
                {fundingGap <= 0 ? "Fully Funded" : "Funding Gap"}
              </p>
              <p
                className={`text-xs mt-0.5 ${
                  fundingGap <= 0 ? "text-green-700" : "text-red-700"
                }`}
              >
                {totalFunding === 0
                  ? "Add your funding sources in the Funding tab to see how this is covered."
                  : fundingGap <= 0
                  ? `You have ${f(Math.abs(fundingGap))} in surplus funding — that becomes your additional opening cash.`
                  : `You need ${f(fundingGap)} more in funding to cover your startup costs.`}
              </p>
            </div>
            <p
              className={`text-2xl font-bold ${
                fundingGap <= 0 ? "text-green-800" : "text-red-700"
              }`}
            >
              {fundingGap <= 0 ? f(Math.abs(fundingGap)) : f(fundingGap)}
            </p>
          </div>
        </div>
      )}

      {/* Helpful context */}
      <div className="rounded-xl border border-[var(--teal-tint-400)] bg-[var(--teal-tint-100)] px-5 py-4">
        <p className="text-xs font-semibold text-[var(--teal)] uppercase tracking-wide mb-2">A Few Things Worth Knowing</p>
        <div className="space-y-2 text-sm text-[var(--teal-deeper)] leading-relaxed">
          <p>The working capital reserve and opening cash buffer are not spent — they sit in your bank account as a cushion. Banks and lenders like to see 3 months of fixed costs in reserve before you open.</p>
          {capexRows.length > 0 ? (
            <p>
              Each capital asset depreciates straight-line over its own useful life, reducing your taxable income
              each year. Enter individual assets in the Equipment &amp; Supplies workspace so each one tracks its
              own schedule.
            </p>
          ) : (
            <p>
              Equipment is on a depreciation schedule, which reduces your taxable income over time. Enter your
              equipment in the Equipment &amp; Supplies workspace so each asset depreciates on its own useful life.
            </p>
          )}
          {loanTotal > 0 && (
            <p>Your loan payment of {f(totalMonthlyLoanPayment)}/month starts from day one : before you have any revenue. Make sure your opening cash buffer can cover at least 3 months of loan payments.</p>
          )}
        </div>
      </div>
    </div>
  );
}
