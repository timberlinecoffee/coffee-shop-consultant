// TIM-1941: shared wrapper for help-doc body copy. Keeps prose width, leading,
// and heading styles consistent across articles without pulling in a
// Tailwind typography plugin we don't already use.

import type { ReactNode } from "react";

export function DocProse({ children }: { children: ReactNode }) {
  return (
    <article
      className={[
        "max-w-3xl text-[var(--foreground)]",
        // paragraph
        "[&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-[var(--foreground)] [&_p]:mb-4",
        // headings
        "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[var(--foreground)] [&_h2]:mt-8 [&_h2]:mb-3",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[var(--foreground)] [&_h3]:mt-6 [&_h3]:mb-2",
        // lists
        "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_ul]:mb-4 [&_ul]:text-sm [&_ul]:text-[var(--foreground)]",
        "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1.5 [&_ol]:mb-4 [&_ol]:text-sm [&_ol]:text-[var(--foreground)]",
        // links
        "[&_a]:text-[var(--teal)] [&_a]:hover:underline",
        // strong
        "[&_strong]:font-semibold",
      ].join(" ")}
    >
      {children}
    </article>
  );
}
