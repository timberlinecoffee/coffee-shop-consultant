"use client";

// TIM-3229: Shared money input. Renders the active workspace currency symbol
// as a leading adornment so every price/cost/fee/revenue field shows the right
// symbol without each caller hardcoding "$". Drop-in for `<input type="number">`
// — forwards every prop and keeps the caller's value / onChange contract
// (onChange still reads `e.target.value`).

import * as React from "react";
import { twMerge } from "tailwind-merge";
import { useCurrency } from "@/components/CurrencyProvider";
import { currencySymbol, DEFAULT_CURRENCY_CODE } from "@/lib/currency";
import { cn } from "@/lib/utils";

export interface MoneyInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Override the symbol when the surface isn't wrapped in CurrencyProvider. */
  currencyCode?: string;
  /**
   * Dense spreadsheet-style cell (matches the menu/ingredient cellInputCls).
   * Uses text-xs + tighter left-padding so the symbol fits in narrow grid cells.
   */
  compact?: boolean;
  /** Override the wrapper class (default: "relative inline-block w-full"). */
  wrapperClassName?: string;
}

export function MoneyInput({
  currencyCode,
  compact = false,
  wrapperClassName,
  className,
  value,
  onChange,
  placeholder,
  ...rest
}: MoneyInputProps) {
  const ctx = useCurrency();
  // Prefer explicit prop → context → USD fallback. Context already falls back
  // to USD when used outside a provider, but the explicit override path lets
  // server-rendered surfaces pass a code that came from the workspace row.
  const symbol = currencyCode
    ? currencySymbol(currencyCode)
    : ctx.symbol || currencySymbol(DEFAULT_CURRENCY_CODE);

  // Compact = grid-cell-sized; default = standard form input.
  const symbolPos = compact ? "left-1.5" : "left-2.5";
  const symbolText = compact ? "text-xs" : "text-sm";
  // TIM-3559: put `padLeft` AFTER `className` so tailwind-merge lets the
  // symbol clearance win over any `px-*` / `pl-*` the caller passes in via
  // their shared inputCls. Prior order let a caller's `px-3` clobber `pl-7`,
  // dropping symbol clearance from 28px to 12px and overlapping the digit
  // (board flag on TIM-3557 — Beverage/Food avg-per-sale in Financial Suite).
  const padLeft = compact ? "pl-6" : "pl-7";

  return (
    <span className={twMerge("relative inline-block w-full", wrapperClassName)}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 -translate-y-1/2 pointer-events-none select-none tabular-nums text-[var(--dark-grey)]",
          symbolPos,
          symbolText,
        )}
      >
        {symbol}
      </span>
      <input
        {...rest}
        type="number"
        value={value === 0 ? "" : value}
        placeholder={placeholder ?? "0"}
        className={twMerge(className, padLeft)}
        onChange={(e) => {
          const el = e.currentTarget;
          const stripped = el.value.replace(/^(-?)0+(?=\d)/, "$1");
          if (stripped !== el.value) el.value = stripped;
          onChange?.(e);
        }}
      />
    </span>
  );
}
