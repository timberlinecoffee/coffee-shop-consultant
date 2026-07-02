// TIM-3569: theme mode registry + shared helpers for the Appearance tab.
//
// Persistence layers:
//   1. localStorage key `gw-theme` — read pre-hydration by ThemeInitScript
//      in src/app/layout.tsx so first paint has the correct .dark class.
//   2. user_ui_prefs pref_key `platform.theme` — read on mount by
//      useThemePreference() so a user who changes theme on device A gets it
//      on device B next visit. Reconciled into localStorage on load.

export const THEME_STORAGE_KEY = "gw-theme";
export const THEME_PREF_KEY = "platform.theme";

export type ThemeMode = "light" | "dark" | "auto";

export const THEME_MODES: ReadonlyArray<{
  id: ThemeMode;
  label: string;
  description: string;
}> = [
  { id: "light", label: "Light", description: "Always use the light palette." },
  { id: "dark", label: "Dark", description: "Always use the dark palette." },
  {
    id: "auto",
    label: "Auto",
    description: "Follow your system preference.",
  },
];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "auto";
}
