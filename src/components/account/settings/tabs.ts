// TIM-1911: canonical tab list for the Settings shell.
// Exported separately so the Node test runner (.mjs) can import without JSX.
export type SettingsTab = {
  id: string;
  label: string;
};

export const SETTINGS_TABS: SettingsTab[] = [
  { id: "account", label: "Account" },
  { id: "localization", label: "Localization" },
  { id: "billing", label: "Billing" },
  { id: "notifications", label: "Notifications" },
  { id: "business-profile", label: "Business profile" },
  { id: "data", label: "Data" },
  { id: "appearance", label: "Appearance" },
];
