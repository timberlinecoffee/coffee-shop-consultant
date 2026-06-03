// TIM-1941: lightweight public top nav for the Help & Support surface.
// Pattern follows /privacy (centered Logo lockup on a white band with a
// "Back to home" link). Kept server-only so the help routes stay static.

import Link from "next/link";
import { Logo } from "../../_components/Logo";

export function HelpTopNav() {
  return (
    <header className="border-b border-[var(--border)] bg-white">
      <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="Groundwork home">
          <Logo variant="color" height={30} />
        </Link>
        <div className="flex items-center gap-5">
          <a
            href="mailto:hello@timberline.coffee"
            className="text-sm text-[var(--teal)] hover:underline hidden sm:inline"
          >
            hello@timberline.coffee
          </a>
          <Link href="/" className="text-sm text-[var(--teal)] hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </header>
  );
}
