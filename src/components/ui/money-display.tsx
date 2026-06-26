"use client";

// TIM-3229: Shared money display. Wraps the platform formatter so every
// price/cost/revenue render gets the workspace currency symbol + locale-aware
// separators. Use this anywhere a money value appears in JSX — tables, cards,
// summaries, etc. For headlines that benefit from compact "K / M" bucketing
// pass `compact` (the default); for menu/ticket prices where cents matter
// visually use `exact`.
//
// Storage convention matches the platform: pass `cents` for minor-unit values
// (the dominant convention — Financial Planner, Menu Pricing, Equipment,
// Hiring all store minor units). Pass `amount` for whole-unit values
// (Benchmarking page-data and a handful of dashboard surfaces).

import * as React from "react";
import { useCurrency } from "@/components/CurrencyProvider";
import { formatMinorExact } from "@/lib/formatters";
import { formatMinorUnits, formatCurrencyAmount, DEFAULT_CURRENCY_CODE } from "@/lib/currency";
import { cn } from "@/lib/utils";

type MoneyDisplayProps = {
  /** Optional override; otherwise reads CurrencyProvider context. */
  currencyCode?: string;
  /** Compact K / M bucketing for large headline figures. Default true. */
  compact?: boolean;
  /** Force exact fraction digits (USD: 2dp). Use for menu / ticket prices. */
  exact?: boolean;
  /** Render `—` (or a custom placeholder) when value is nullish or NaN. */
  placeholder?: string;
  className?: string;
  title?: string;
} & (
  | { cents: number | null | undefined; amount?: never }
  | { amount: number | null | undefined; cents?: never }
);

export function MoneyDisplay(props: MoneyDisplayProps) {
  const ctx = useCurrency();
  const code = props.currencyCode ?? ctx.currencyCode ?? DEFAULT_CURRENCY_CODE;

  const raw = "cents" in props ? props.cents : props.amount;
  const valid = typeof raw === "number" && Number.isFinite(raw);
  if (!valid) {
    return (
      <span className={props.className} title={props.title}>
        {props.placeholder ?? "—"}
      </span>
    );
  }

  let text: string;
  if (props.exact) {
    // formatMinorExact takes cents; for whole-unit amount, scale up.
    const cents = "cents" in props ? (raw as number) : Math.round((raw as number) * 100);
    text = formatMinorExact(cents, code);
  } else {
    const compact = props.compact !== false;
    text = "cents" in props
      ? formatMinorUnits(raw as number, code)
      : formatCurrencyAmount(raw as number, code, { compact });
  }

  return (
    <span className={cn("tabular-nums", props.className)} title={props.title}>
      {text}
    </span>
  );
}
