// TIM-1941: sample doc 2 — "Managing Your Equipment List".
// Board cap: under 500 words. Equipment is one of Groundwork's canonical
// stable surfaces (TIM-1894 reference) so this is the second safe pick.

import Link from "next/link";
import { HelpPageHeader } from "../_components/HelpPageHeader";
import { DocProse } from "../_components/DocProse";

export const metadata = {
  title: "Managing Your Equipment List | Help",
  description:
    "Add, edit, and organize equipment in the Build Out & Equipment workspace.",
};

export default function ManagingEquipmentDocPage() {
  return (
    <>
      <HelpPageHeader
        iconKey="wrench"
        title="Managing Your Equipment List"
        description="Add equipment, set costs and quantities, and keep your buildout budget in sync."
        active="docs"
      />
      <DocProse>
        <p>
          Your equipment list lives inside the Build Out &amp; Equipment
          workspace. It&rsquo;s a spreadsheet where every row is a piece of
          equipment, and the totals feed straight into your startup costs and
          financial projections.
        </p>

        <h2>Open the workspace</h2>
        <p>
          From the dashboard, choose <strong>Build Out &amp; Equipment</strong>.
          You&rsquo;ll land on the equipment grid. If you completed onboarding,
          we&rsquo;ve already pre-filled a starter list based on your concept.
        </p>

        <h2>Add an item</h2>
        <p>
          Click <strong>Add row</strong> at the bottom of the table. A blank
          row appears. Fill in:
        </p>
        <ul>
          <li>
            <strong>Name:</strong> what you call the item (for example,
            &ldquo;Two-group espresso machine&rdquo;).
          </li>
          <li>
            <strong>Brand &amp; Model:</strong> useful when you&rsquo;re
            shopping or requesting quotes.
          </li>
          <li>
            <strong>Supplier:</strong> who you plan to buy it from.
          </li>
          <li>
            <strong>Unit Cost:</strong> price per unit, before tax.
          </li>
          <li>
            <strong>Qty:</strong> how many you need. The row total
            (Unit Cost x Qty) updates automatically.
          </li>
          <li>
            <strong>Useful Life:</strong> years over which the item
            depreciates. Used by Financials.
          </li>
          <li>
            <strong>Category &amp; Financing:</strong> buckets used in the
            startup-cost summary.
          </li>
        </ul>

        <h2>Edit a cell</h2>
        <p>
          Click any cell to edit it directly. Press <strong>Tab</strong> to move
          to the next field, or <strong>Enter</strong> to jump to the next row.
          Edits save as you type. There&rsquo;s no separate
          &ldquo;save&rdquo; step on equipment.
        </p>

        <h2>Hide or show columns</h2>
        <p>
          Click the column settings icon above the table to toggle Brand,
          Model, Supplier, Cost, Financing, Category, Useful Life, and Notes.
          Hidden columns are remembered on your device.
        </p>

        <h2>Sort, filter, and delete</h2>
        <p>
          Click a column header to sort. Use the filter row under the headers
          to narrow rows down. To remove an item, click the trash icon on the
          right of its row.
        </p>

        <h2>How equipment flows into Financials</h2>
        <p>
          Every row becomes a capital expenditure in your Financials workspace:
          startup costs roll up the totals, and depreciation follows the
          Useful Life you set. Update equipment here and Financials reflects
          it on the next load.
        </p>

        <h2>Need help?</h2>
        <p>
          Email <a href="mailto:hello@timberline.coffee">hello@timberline.coffee</a>{" "}
          or use the <Link href="/help/contact">contact form</Link>. We answer
          within one business day.
        </p>
      </DocProse>
    </>
  );
}
