"use client";

// TIM-1741: platform-wide currency context. Every money display reads the
// account's selected currency through useCurrency() so a single Settings
// change re-symbols and re-formats the whole platform. Formatting itself is
// delegated to the central utility in src/lib/currency.ts.

import { createContext, useContext, useMemo } from "react";
import {
  DEFAULT_CURRENCY_CODE,
  currencySymbol,
  formatCurrencyAmount,
  formatMinorUnits,
  normalizeCurrencyCode,
} from "@/lib/currency";

export interface CurrencyContextValue {
  /** Normalized ISO 4217 code currently in effect. */
  currencyCode: string;
  /** Format a whole-unit amount (compact K/M by default — see currency.ts). */
  format: (n: number, opts?: { compact?: boolean }) => string;
  /** Format a minor-unit (cents) amount. */
  formatMinor: (minorUnits: number) => string;
  /** Bare currency symbol (e.g. "$", "€") for input prefixes. */
  symbol: string;
}

function buildValue(code: string): CurrencyContextValue {
  const normalized = normalizeCurrencyCode(code);
  return {
    currencyCode: normalized,
    format: (n, opts) => formatCurrencyAmount(n, normalized, opts),
    formatMinor: (minorUnits) => formatMinorUnits(minorUnits, normalized),
    symbol: currencySymbol(normalized),
  };
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  currencyCode,
  children,
}: {
  currencyCode: string | null | undefined;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => buildValue(currencyCode ?? DEFAULT_CURRENCY_CODE),
    [currencyCode]
  );
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/**
 * Read the active currency formatter. Falls back to a USD formatter when used
 * outside a provider so a component is never crash-coupled to provider
 * placement (matches the prior default-USD behavior).
 */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  return ctx ?? buildValue(DEFAULT_CURRENCY_CODE);
}
