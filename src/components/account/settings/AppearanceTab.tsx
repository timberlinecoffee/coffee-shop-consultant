// TIM-3569: Settings → Appearance theme selector (Light / Dark / Auto).
//
// Persistence: user_ui_prefs pref_key `platform.theme` (see
// use-theme-preference.ts). Applied to <html> immediately on change; no
// reload. Default = Auto (respects prefers-color-scheme).

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useThemePreference } from "@/lib/use-theme-preference";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";

export function AppearanceTab() {
  const { mode, setMode } = useThemePreference();

  return (
    <Card className="max-w-full">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          Choose how Groundwork looks. Auto follows your system preference.
        </p>
        <fieldset>
          <legend className="sr-only">Theme</legend>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="flex flex-col gap-2 sm:flex-row sm:gap-3"
          >
            {THEME_MODES.map((option) => (
              <ThemeOption
                key={option.id}
                option={option}
                selected={mode === option.id}
                onSelect={() => setMode(option.id)}
              />
            ))}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}

type ThemeOptionProps = {
  option: (typeof THEME_MODES)[number];
  selected: boolean;
  onSelect: () => void;
};

function ThemeOption({ option, selected, onSelect }: ThemeOptionProps) {
  const inputId = `theme-${option.id}`;
  return (
    <label
      htmlFor={inputId}
      className={`flex-1 cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
        selected
          ? "border-[var(--teal)] bg-[var(--teal-bg-100)]"
          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--teal)]/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="radio"
          name="theme"
          value={option.id}
          checked={selected}
          onChange={onSelect}
          className="accent-[var(--teal)]"
          data-theme-option={option.id}
        />
        <span
          className={`text-sm font-medium ${
            selected ? "text-[var(--teal)]" : "text-[var(--foreground)]"
          }`}
        >
          {option.label}
        </span>
      </div>
      <p className="mt-1 pl-6 text-xs text-[var(--muted-foreground)]">
        {option.description}
      </p>
    </label>
  );
}

// Re-export so consumers importing from `@/components/account/settings/AppearanceTab`
// don't need a second import for the type.
export type { ThemeMode };
