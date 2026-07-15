"use client";

// TIM-3229 + TIM-3734: Shared money display. Wraps the platform formatter so
// every price/cost/revenue render gets the workspace currency symbol +
// locale-aware separators, always at the currency's native fraction digits
// (`$37,700.00`). Compact K/M shorthand was removed by TIM-3734 (board
// directive TIM-3732) — every financial figure renders at full precision.
//
// Storage convention matches the platform: pass `cents` for minor-unit values
// (the dominant convention — Financial Planner, Menu Pricing, Equipment,
// Hiring all store minor units). Pass `amount` for whole-unit values
// (Benchmarking page-data and a handful of dashboard surfaces).

import * as React from "react";
import { useCurrency } from "@/components/CurrencyProvider";
import { formatMinorUnits, formatCurrencyAmount, DEFAULT_CURRENCY_CODE } from "@/lib/currency";
import { cn } from "@/lib/utils";

type MoneyDisplayProps = {
  /** Optional override; otherwise reads CurrencyProvider context. */
  currencyCode?: string;
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

  const text = "cents" in props
    ? formatMinorUnits(raw as number, code)
    : formatCurrencyAmount(raw as number, code);

  return (
    <span className={cn("tabular-nums", props.className)} title={props.title}>
      {text}
    </span>
  );
}
