// TIM-1941: registry for the customer-facing Help & Support docs.
// Board explicitly capped scope at 2 stable-feature docs at launch — the
// platform is still evolving, so we don't write docs for shifting surfaces.
// Add new entries here; the index page reads from this list.

export type HelpDoc = {
  slug: string;
  title: string;
  blurb: string;
  category: "Getting Started" | "Workspaces" | "Account & Billing";
  readMinutes: number;
};

export const HELP_DOCS: ReadonlyArray<HelpDoc> = [
  {
    slug: "getting-started",
    title: "Getting Started With Groundwork",
    blurb:
      "Create your account, walk through onboarding, and finish your first workspace.",
    category: "Getting Started",
    readMinutes: 3,
  },
  {
    slug: "managing-equipment",
    title: "Managing Your Equipment List",
    blurb:
      "Add, edit, and organize equipment in Build Out & Equipment, the spreadsheet that feeds your startup costs.",
    category: "Workspaces",
    readMinutes: 3,
  },
];
