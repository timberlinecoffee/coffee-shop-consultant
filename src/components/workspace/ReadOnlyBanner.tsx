// TIM-3442: one banner for every locked workspace, wording derived from the
// user's actual state rather than hardcoded per screen.
//
// Each surface used to spell out its own sentence, which is how "your
// subscription is paused" ended up in front of 23 people who had never
// subscribed. Screens now ask `readOnlyReason()` and render whatever it
// returns, so there is exactly one place a wrong reason could come from — and
// read-only-reason.test.mjs checks that place against the access gate itself.

import Link from "next/link";
import { UPGRADE_PATH } from "@/lib/access";
import { readOnlyReason, type AccessSnapshot } from "@/lib/read-only-reason";

export function ReadOnlyBanner({
  user,
  className = "",
  returnHref,
}: {
  user: AccessSnapshot;
  className?: string;
  /** Where to send the user back to after they choose a plan. */
  returnHref?: string;
}) {
  const copy = readOnlyReason(user);
  if (copy.kind === "editable") return null;

  const href = returnHref
    ? `${UPGRADE_PATH}?return=${encodeURIComponent(returnHref)}`
    : UPGRADE_PATH;

  return (
    <div
      role="alert"
      className={`rounded-xl border border-[var(--warning-amber-bg-2)] bg-[var(--warning-bg-8)] px-4 py-3 text-sm text-[var(--warning-text-9)] ${className}`}
    >
      <p className="font-medium mb-1">{copy.heading}</p>
      <p className="leading-relaxed">
        {copy.body}{" "}
        <Link
          href={href}
          className="underline font-medium text-[var(--warning-text-9)]"
        >
          {copy.ctaLabel}
        </Link>
        .
      </p>
    </div>
  );
}
