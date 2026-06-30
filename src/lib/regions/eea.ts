// EEA member states + UK + Switzerland.
// Used by the Scout DeepSeek geo-gate (TIM-3460) so EU/UK/CH users are
// never routed to DeepSeek's mainland-China inference even when the
// `scout_deepseek_prod_enabled` flag is on.

const EEA_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
] as const;

const EXTRA_RESTRICTED_COUNTRIES = ["GB", "CH"] as const;

export const EU_GATE_COUNTRY_SET: ReadonlySet<string> = new Set<string>([
  ...EEA_COUNTRIES,
  ...EXTRA_RESTRICTED_COUNTRIES,
]);

export type EuGateCountry = (typeof EEA_COUNTRIES)[number] | (typeof EXTRA_RESTRICTED_COUNTRIES)[number];

export function isEea(country: string | null | undefined): boolean {
  if (!country) return false;
  return EU_GATE_COUNTRY_SET.has(country.toUpperCase());
}

export type DeepSeekRouteDecision = {
  allowed: boolean;
  reason: "ok" | "eu_gate_blocked" | "unknown_region_blocked";
};

// Conservative gate: when the country is unknown (no header, no profile),
// block DeepSeek. Caller may then fall back to the primary Anthropic lane.
export function evaluateDeepSeekGeoGate(country: string | null | undefined): DeepSeekRouteDecision {
  if (!country) return { allowed: false, reason: "unknown_region_blocked" };
  if (isEea(country)) return { allowed: false, reason: "eu_gate_blocked" };
  return { allowed: true, reason: "ok" };
}
