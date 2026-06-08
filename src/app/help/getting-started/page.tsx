// TIM-1941: sample doc 1 — "Getting Started With Groundwork".
// Board cap: under 500 words. Cover stable surfaces only (signup, onboarding,
// the dashboard module list).

import Link from "next/link";
import { HelpPageHeader } from "../_components/HelpPageHeader";
import { DocProse } from "../_components/DocProse";

export const metadata = {
  title: "Getting Started With Groundwork | Help",
  description:
    "Create your Groundwork account, finish onboarding, and find your way around the dashboard.",
};

export default function GettingStartedDocPage() {
  return (
    <>
      <HelpPageHeader
        iconKey="compass"
        title="Getting Started With Groundwork"
        description="Create your account, finish onboarding, and learn how the dashboard fits together."
        active="docs"
      />
      <DocProse>
        <p>
          Groundwork is the planning platform from Timberline Coffee School. It
          walks you through every decision that goes into opening a coffee
          shop, in the order you actually have to make them. This article gets
          you from sign-up to your first plan.
        </p>

        <h2>1. Create your account</h2>
        <p>
          Go to <Link href="/signup">groundwork.coffee/signup</Link>, enter your
          name, email, and a password, and confirm your email address. We use
          your email for password resets and the occasional product update,
          nothing else.
        </p>

        <h2>2. Finish onboarding</h2>
        <p>
          After you log in, Groundwork asks a short series of questions about
          the shop you want to open: city, concept, target opening month, and
          rough budget range. These answers seed your plan so you don&rsquo;t
          start from a blank page.
        </p>
        <p>
          You can change any of these later from the Concept workspace. Nothing
          you enter during onboarding is locked in.
        </p>

        <h2>3. Find your way around the dashboard</h2>
        <p>
          Your dashboard lists the eight planning modules in the order we
          recommend tackling them:
        </p>
        <ul>
          <li>
            <strong>Concept:</strong> your shop&rsquo;s identity, location
            type, and opening timeline.
          </li>
          <li>
            <strong>Location &amp; Lease:</strong> what to look for in a space
            and how to read a lease.
          </li>
          <li>
            <strong>Menu &amp; Pricing:</strong> drinks, food, costs, and
            target margins.
          </li>
          <li>
            <strong>Build Out &amp; Equipment:</strong> the equipment list and
            buildout costs that feed your startup budget.
          </li>
          <li>
            <strong>Suppliers:</strong> coffee, dairy, and the rest of your
            supply chain.
          </li>
          <li>
            <strong>Hiring:</strong> roles, pay, and your launch team.
          </li>
          <li>
            <strong>Operations Playbook:</strong> opening, closing, and daily
            standards.
          </li>
          <li>
            <strong>Financials:</strong> Year 1-5 projections, P&amp;L, and
            cash flow.
          </li>
        </ul>
        <p>
          Each module saves automatically as you work. You can leave one in the
          middle and come back later without losing anything.
        </p>

        <h2>4. Ask Scout when you get stuck</h2>
        <p>
          Scout, the Groundwork assistant, lives in the bottom-right of every
          workspace. Ask anything about your plan. Scout reads what
          you&rsquo;ve already entered and answers in context.
        </p>

        <h2>5. Need a hand?</h2>
        <p>
          If you&rsquo;re stuck on something Scout can&rsquo;t help with,
          email{" "}
          <a href="mailto:hello@timberline.coffee">hello@timberline.coffee</a>{" "}
          or use the{" "}
          <Link href="/help/contact">contact form</Link>. A human will get back
          to you within one business day.
        </p>
      </DocProse>
    </>
  );
}
