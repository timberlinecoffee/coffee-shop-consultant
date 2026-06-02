"use client";

// TIM-1741: CurrencyProvider + useCurrency hook.
// Wraps a subtree with the account's selected ISO 4217 currency so every money
// render uses the correct symbol, separator, and fraction digits — no hardcoded "$".

import { createContext, useContext, type ReactNode } from "react";
import { formatCurrencyAmount, formatMinorUnits, currencySymbol } from "@/lib/currency";

interface CurrencyContextValue {
  currencyCode: string;
  format: (amount: number, opts?: { compact?: boolean }) => string;
  formatMinor: (minorUnits: number) => string;
  symbol: string;
}

const DEFAULT_CODE = "USD";

const CurrencyContext = createContext<CurrencyContextValue>({
  currencyCode: DEFAULT_CODE,
  format: (n, opts) => formatCurrencyAmount(n, DEFAULT_CODE, opts),
  formatMinor: (m) => formatMinorUnits(m, DEFAULT_CODE),
  symbol: "$",
});

export function CurrencyProvider({
  currencyCode,
  children,
}: {
  currencyCode: string;
  children: ReactNode;
}) {
  const value: CurrencyContextValue = {
    currencyCode,
    format: (n, opts) => formatCurrencyAmount(n, currencyCode, opts),
    formatMinor: (m) => formatMinorUnits(m, currencyCode),
    symbol: currencySymbol(currencyCode),
  };
  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
