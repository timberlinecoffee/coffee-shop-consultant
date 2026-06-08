// TIM-2478 (F3 + F7): central formatter helpers. Anything user-visible that
// would otherwise reach for `.toFixed(N)` inside JSX in src/app/(app)/workspace/**
// must route through one of these so identical underlying values render
// identically across tabs and workspaces. ESLint blocks `.toFixed(` in JSX in
// that subtree — see eslint.config.mjs.
//
// Re-exports the canonical primitives that already exist; do NOT redefine them
// here. New formatters live in this file so importers have one stop.

import { fmtPct as fmtPctRatio } from "./format.ts";
import { formatMinorUnits, getCurrencyMeta } from "./currency.ts";

// `fmtPct(ratio)` — one decimal place. Input is a ratio (0..1). For percent-
// scale inputs (e.g. 65 for 65%), divide by 100 first.
export { fmtPctRatio as fmtPct };

// `formatMinor(cents, code?)` — currency-aware compact format (K / M for
// large totals; 0dp). Use for headline / summary totals where the existing
// `useCurrency().formatMinor` already lives. For exact 2dp prices (menu,
// ticket, sub-$1000 amounts) reach for `formatMinorExact`.
export { formatMinorUnits as formatMinor };

// `fmtIntegerPct(ratio)` — 0dp from a 0..1 ratio. The compact variant used in
// tables and badges where 1dp would feel noisy ("65%" vs "65.0%").
export function fmtIntegerPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// `formatMinorExact(cents, code?)` — currency formatter that always shows the
// currency's natural fraction digits (2 for USD/EUR, 0 for JPY) and never
// rounds into compact K/M form. Use for menu prices, ticket prices, COGS at
// the per-item level — anywhere the cents matter visually.
export function formatMinorExact(cents: number, code: string = "USD"): string {
  const meta = getCurrencyMeta(code);
  const divisor = Math.pow(10, meta.fractionDigits);
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: meta.fractionDigits,
    maximumFractionDigits: meta.fractionDigits,
  }).format(cents / divisor);
}

// "1.5:1" — one decimal place, used for ratios like debt-to-equity. Avoid
// `.toFixed(1)` at call sites so the precision and trailing-":1" stay aligned
// across surfaces.
export function formatRatioToOne(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded.toFixed(1)}:1`;
}

// Integer 0..100 progress percent. Returns 0 when `total <= 0` so callers don't
// need to guard division. Clamped to 0..100 so floating-point edges or rogue
// inputs can never overflow a progress bar.
export function progressPct(done: number, total: number): number {
  if (!total || total <= 0) return 0;
  const raw = (done / total) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

