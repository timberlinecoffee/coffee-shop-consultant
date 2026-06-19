// TIM-2755: Shared helpers for propagating Business Plan brand color to the
// financials workspace without a page reload. The branding panel broadcasts
// the new hex on every change; the financials workspace listens.

export const BP_BRAND_CHANNEL_NAME = "bp-brand-color";
export const BP_BRAND_LS_KEY = "bp_accent_color";

export function broadcastBpBrandColor(hex: string): void {
  try {
    localStorage.setItem(BP_BRAND_LS_KEY, hex);
    const ch = new BroadcastChannel(BP_BRAND_CHANNEL_NAME);
    ch.postMessage({ accentColor: hex });
    ch.close();
  } catch {
    // SSR or private-browsing mode — silently skip.
  }
}

export function readCachedBpBrandColor(): string | null {
  try {
    return localStorage.getItem(BP_BRAND_LS_KEY);
  } catch {
    return null;
  }
}

/** Derive CSS custom-property values from a hex brand color. */
export function brandCssVars(hex: string): Record<string, string> {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    "--bp-brand": hex,
    "--bp-brand-soft": `rgba(${r},${g},${b},0.6)`,
    "--bp-brand-highlight": `rgba(${r},${g},${b},0.12)`,
  };
}
