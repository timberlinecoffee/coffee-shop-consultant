// TIM-1941: minimal dark footer for the Help & Support surface.
// Mirrors the structure of the landing-page footer (src/app/page.tsx) so the
// brand chrome stays consistent. Required: visible mailto link on every page.

import Link from "next/link";
import { Logo } from "../../_components/Logo";

export function HelpFooter() {
  return (
    <footer
      style={{ background: "var(--neutral-900)", padding: "48px 24px 32px" }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <Logo variant="white" height={28} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 mb-10">
          <div>
            <p
              className="font-semibold uppercase mb-4"
              style={{
                color: "var(--neutral-500)",
                fontSize: "11px",
                letterSpacing: "0.08em",
              }}
            >
              Help
            </p>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/help"
                  className="transition-colors"
                  style={{
                    color: "var(--neutral-400)",
                    fontSize: "14px",
                    textDecoration: "none",
                  }}
                >
                  All docs
                </Link>
              </li>
              <li>
                <Link
                  href="/help/contact"
                  className="transition-colors"
                  style={{
                    color: "var(--neutral-400)",
                    fontSize: "14px",
                    textDecoration: "none",
                  }}
                >
                  Contact support
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p
              className="font-semibold uppercase mb-4"
              style={{
                color: "var(--neutral-500)",
                fontSize: "11px",
                letterSpacing: "0.08em",
              }}
            >
              Contact
            </p>
            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:hello@timberline.coffee"
                  className="transition-colors"
                  style={{
                    color: "var(--neutral-400)",
                    fontSize: "14px",
                    textDecoration: "none",
                  }}
                >
                  hello@timberline.coffee
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p
              className="font-semibold uppercase mb-4"
              style={{
                color: "var(--neutral-500)",
                fontSize: "11px",
                letterSpacing: "0.08em",
              }}
            >
              Legal
            </p>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/terms"
                  className="transition-colors"
                  style={{
                    color: "var(--neutral-400)",
                    fontSize: "14px",
                    textDecoration: "none",
                  }}
                >
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="transition-colors"
                  style={{
                    color: "var(--neutral-400)",
                    fontSize: "14px",
                    textDecoration: "none",
                  }}
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div
          className="border-t pt-6"
          style={{ borderColor: "var(--neutral-800)" }}
        >
          <p
            style={{ color: "var(--neutral-600)", fontSize: "13px" }}
          >
            &copy; {new Date().getFullYear()} Ivy &amp; Rill Consulting Inc. All
            rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
