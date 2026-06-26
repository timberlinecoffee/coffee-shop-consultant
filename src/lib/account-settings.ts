// TIM-1741: platform-wide (per-account) settings — Localization group.
//
// Single source of truth for the account's currency + localization
// preferences. Currency formatting itself lives in ./currency.ts; this module
// owns persistence shape, defaults, and coercion so the API route, server
// components, and the client provider all agree on the contract.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CURRENCY_CODE,
  normalizeCurrencyCode,
} from "./currency";

export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
export type NumberFormat = "1,234.56" | "1.234,56" | "1 234,56";

export interface LocalizationSettings {
  /** Display order for dates across the platform. */
  dateFormat: DateFormat;
  /** Thousands/decimal separator style for plain (non-currency) numbers. */
  numberFormat: NumberFormat;
  /** IANA timezone (e.g. "America/Los_Angeles"). Empty string = system default. */
  timezone: string;
  /** Fiscal-year start month, 1 (January) … 12 (December). */
  fiscalYearStartMonth: number;
}

export interface AccountSettings {
  /** ISO 4217 currency code, always normalized to a known code. */
  currencyCode: string;
  localization: LocalizationSettings;
  /** BCP 47-ish language code for AI-generated output. UI labels stay in English. */
  preferredLanguage: string;
}

export interface SupportedLanguage {
  code: string;
  label: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "fr", label: "French" },
  { code: "it", label: "Italian" },
  { code: "de", label: "German" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Mandarin Chinese" },
  { code: "nl", label: "Dutch" },
];

export const DATE_FORMATS: DateFormat[] = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];
export const NUMBER_FORMATS: NumberFormat[] = ["1,234.56", "1.234,56", "1 234,56"];

export const DEFAULT_LOCALIZATION: LocalizationSettings = {
  dateFormat: "MM/DD/YYYY",
  numberFormat: "1,234.56",
  timezone: "",
  fiscalYearStartMonth: 1,
};

export const DEFAULT_PREFERRED_LANGUAGE = "en";

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  currencyCode: DEFAULT_CURRENCY_CODE,
  localization: DEFAULT_LOCALIZATION,
  preferredLanguage: DEFAULT_PREFERRED_LANGUAGE,
};

function isDateFormat(v: unknown): v is DateFormat {
  return typeof v === "string" && (DATE_FORMATS as string[]).includes(v);
}

function isNumberFormat(v: unknown): v is NumberFormat {
  return typeof v === "string" && (NUMBER_FORMATS as string[]).includes(v);
}

/**
 * Coerce an untrusted localization blob (DB jsonb or request body) into a
 * fully-populated, valid LocalizationSettings. Unknown/missing fields fall
 * back to defaults so partial payloads and pre-migration rows never throw.
 */
export function coerceLocalization(raw: unknown): LocalizationSettings {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const month = Number(obj.fiscalYearStartMonth);
  return {
    dateFormat: isDateFormat(obj.dateFormat) ? obj.dateFormat : DEFAULT_LOCALIZATION.dateFormat,
    numberFormat: isNumberFormat(obj.numberFormat) ? obj.numberFormat : DEFAULT_LOCALIZATION.numberFormat,
    timezone: typeof obj.timezone === "string" ? obj.timezone : DEFAULT_LOCALIZATION.timezone,
    fiscalYearStartMonth:
      Number.isInteger(month) && month >= 1 && month <= 12
        ? month
        : DEFAULT_LOCALIZATION.fiscalYearStartMonth,
  };
}

/**
 * Resolve the account's settings server-side. Tolerant of the pre-migration
 * state (columns absent) and of missing rows — always returns valid defaults
 * rather than throwing, so money/date rendering never hard-fails.
 */
function normalizePreferredLanguage(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") return DEFAULT_PREFERRED_LANGUAGE;
  const code = raw.trim().toLowerCase();
  return SUPPORTED_LANGUAGES.some((l) => l.code === code) ? code : DEFAULT_PREFERRED_LANGUAGE;
}

export async function getAccountSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<AccountSettings> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("currency_code, localization, preferred_language")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return DEFAULT_ACCOUNT_SETTINGS;
    const row = data as { currency_code?: unknown; localization?: unknown; preferred_language?: unknown };
    return {
      currencyCode: normalizeCurrencyCode(row.currency_code),
      localization: coerceLocalization(row.localization),
      preferredLanguage: normalizePreferredLanguage(row.preferred_language),
    };
  } catch {
    return DEFAULT_ACCOUNT_SETTINGS;
  }
}

/** Fetch only the user's preferred language — lightweight alternative to getAccountSettings. */
export async function getPreferredLanguage(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("preferred_language")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return DEFAULT_PREFERRED_LANGUAGE;
    return normalizePreferredLanguage((data as { preferred_language?: unknown }).preferred_language);
  } catch {
    return DEFAULT_PREFERRED_LANGUAGE;
  }
}

/** Build the language directive injected into AI system prompts. */
export function buildAiLanguageDirective(langCode: string): string {
  if (!langCode || langCode === "en") return "";
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
  const langName = lang ? lang.label : langCode;
  return `Language: Write ALL prose and narrative content in ${langName}. Field names, section headings, labels, and numeric formats stay in English — only the generated paragraph text must be in ${langName}.`;
}
