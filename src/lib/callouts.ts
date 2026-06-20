// TIM-2423: central registry for the DismissibleCallout pattern.
// Spec lives in the TIM-1537 style guide → Component Patterns → DismissibleCallout.
//
// Persistence: a single per-user pref row at pref_key `platform.dismissed-callouts`
// stores `Record<calloutKey, ISO timestamp>` via the existing TIM-1215 user_ui_prefs
// table. One round-trip on mount + one PUT per dismiss. The Settings → Preferences →
// Guided Notices surface reads the same row to let owners resurface dismissed callouts.

export const DISMISSED_CALLOUTS_PREF_KEY = "platform.dismissed-callouts";

export type CalloutKey = string;

export type CalloutRegistryEntry = {
  /** Human-readable label shown in Settings → Preferences → Guided Notices. */
  label: string;
  /** Workspace label (e.g. "Financials", "Equipment & Supplies"). */
  workspace: string;
};

/**
 * Single source of truth for active callout keys. Every <DismissibleCallout>
 * must reference a key listed here so the Settings resurface UI can name it.
 * Adding a key: pick `<workspace>.<feature-or-intent>`, lowercase, hyphen-separated.
 * Retiring a key: move it to DEPRECATED_CALLOUT_KEYS (do NOT reuse the string).
 */
export const CALLOUT_REGISTRY: Record<CalloutKey, CalloutRegistryEntry> = {
  "financials.guided-setup-intro": {
    label: "Financial Planner walkthrough",
    workspace: "Financials",
  },
  "financials.startup-costs-tab-pointer": {
    label: "Startup Costs tab pointer",
    workspace: "Financials",
  },
  "financials.startup-equipment-first-intro": {
    label: "Startup Costs: equipment-first intro",
    workspace: "Financials",
  },
  "buildout-equipment.seed-equipment-prompt": {
    label: "Equipment starter-list prompt",
    workspace: "Equipment & Supplies",
  },
  "buildout-equipment.seed-supplies-prompt": {
    label: "Supplies starter-list prompt",
    workspace: "Equipment & Supplies",
  },
  "operations-playbook.shop-type-sop": {
    label: "Shop-type SOP calibration notice",
    workspace: "Operations Playbook",
  },
};

/**
 * Retired keys. Surfaces them in audits so we know the string is permanently
 * reserved. Format: `oldKey -> replacementKey | null` (null = removed outright).
 */
export const DEPRECATED_CALLOUT_KEYS: Record<CalloutKey, CalloutKey | null> = {};

export function isKnownCalloutKey(key: string): key is CalloutKey {
  return Object.prototype.hasOwnProperty.call(CALLOUT_REGISTRY, key);
}

export type DismissedCalloutsMap = Record<CalloutKey, string>;

export function isDismissedCalloutsMap(value: unknown): value is DismissedCalloutsMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k !== "string" || typeof v !== "string") return false;
  }
  return true;
}
