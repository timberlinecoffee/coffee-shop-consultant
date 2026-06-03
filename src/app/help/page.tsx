// TIM-1941: Help & Support index page. Lists available docs in the
// canonical Equipment-style table; sub-nav handles the jump to the contact
// form.

import { HelpPageHeader } from "./_components/HelpPageHeader";
import { DocsTable } from "./_components/DocsTable";
import { HelpEmailButton } from "./_components/HelpEmailButton";

export const metadata = {
  title: "Help & Support | Groundwork",
  description:
    "Browse help articles for Groundwork or send a message to the Timberline Coffee School team.",
};

export default function HelpIndexPage() {
  return (
    <>
      <HelpPageHeader
        iconKey="life-buoy"
        title="Help & Support"
        description="Quick answers to common Groundwork questions. Can't find what you need? Send us a note and we'll get back to you."
        active="docs"
        actions={<HelpEmailButton />}
      />
      <DocsTable />
      <p className="mt-6 text-xs text-[var(--muted-foreground)]">
        Prefer email? Reach the team any time at{" "}
        <a
          href="mailto:hello@timberline.coffee"
          className="text-[var(--teal)] hover:underline font-semibold"
        >
          hello@timberline.coffee
        </a>
        .
      </p>
    </>
  );
}
