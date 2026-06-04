import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/app/_components/Logo";
import { CookiePreferencesLink } from "@/components/consent/CookiePreferencesLink";
import { WaitlistForm } from "./WaitlistForm";

// TIM-2285: Groundwork.AI coming-soon page. Hero copy + features approved by
// Marketing (TIM-2284). Style guide TIM-1537 — uses landing-page tokens
// (--teal, --sage, --teal-dark) and the canonical Logo component. No new
// design system work.

export const metadata: Metadata = {
  title: "Groundwork.AI — Almost Here. Join the Waitlist.",
  description:
    "Groundwork.AI is almost here. Join the waitlist and lock in your exclusive launch price, permanently below public plans.",
  openGraph: {
    title: "Groundwork.AI — Almost Here. Join the Waitlist.",
    description:
      "Join the waitlist and lock in your exclusive launch price, permanently below public plans.",
    siteName: "Groundwork",
  },
  robots: { index: false, follow: false },
};

type Feature = {
  title: string;
  body: string;
  accent: "teal" | "sage";
  icon: React.ReactNode;
};

// 4–6 features that are actually shipped in the platform today (audited
// 2026-06-04 against src/app/workspace/*, src/app/api/copilot/*, src/app/api/
// pdf/*, and the live landing page). Each maps to a real working module.
const FEATURES: Feature[] = [
  {
    accent: "teal",
    title: "Eight-Module Planning Suite",
    body: "Concept, location, menu, equipment, hiring, financials, operations, and launch — sequenced in the order owners actually decide.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    accent: "sage",
    title: "Real Coffee Shop Benchmarks",
    body: "Startup cost, rent, COGS, labor, and margin held up against operator-reported data — flagged the moment a number drifts out of range.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" x2="18" y1="20" y2="10" />
        <line x1="12" x2="12" y1="20" y2="4" />
        <line x1="6" x2="6" y1="20" y2="14" />
      </svg>
    ),
  },
  {
    accent: "teal",
    title: "Scout, the Coffee-Specific AI Assistant",
    body: "Ask about your lease, menu, or equipment list. Scout reads your plan and answers in coffee terms — not generic small-business advice.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    accent: "sage",
    title: "Live Financial Model",
    body: "Startup cost and a 12-month projection that refresh as you change rent, opening date, ticket size, or daily transactions.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    accent: "teal",
    title: "Menu Pricing & Recipe Costing",
    body: "Cost-per-cup with margin targets, updated as supplier prices move. Spot the drinks that quietly cost you money.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    ),
  },
  {
    accent: "sage",
    title: "Milestone-Based Launch Plan",
    body: "Hiring, build-out, soft-open, and opening-month checklists tied to your open date — with one clear next action at every step.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

export default function ComingSoonPage() {
  return (
    <main
      className="min-h-screen flex flex-col"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(118,179,157,0.18) 0%, transparent 55%), linear-gradient(180deg, var(--teal) 0%, var(--teal-dark, #0a3d3f) 100%)",
        color: "white",
      }}
    >
      {/* ── Top bar (minimal — no nav, no sign-in CTA pre-launch) ────────────── */}
      <header className="w-full">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/coming-soon" className="flex items-center" aria-label="Groundwork.AI home">
            <Logo variant="white" height={40} priority />
          </Link>
          <span
            className="font-semibold uppercase"
            style={{
              fontSize: "11px",
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Coming Soon
          </span>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center" style={{ padding: "48px 24px 80px" }}>
        <div className="max-w-3xl mx-auto w-full text-center">
          <p
            className="font-semibold uppercase mb-5"
            style={{
              fontSize: "11px",
              letterSpacing: "0.18em",
              color: "var(--sage)",
            }}
          >
            Groundwork.AI &mdash; Waitlist Open
          </p>
          <h1
            className="font-bold mb-6"
            style={{
              fontSize: "clamp(2rem, 5.5vw, 3.25rem)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "white",
            }}
          >
            Groundwork.AI Is Almost Here
          </h1>
          <p
            className="mx-auto mb-10"
            style={{
              fontSize: "clamp(1.0625rem, 2vw, 1.25rem)",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.85)",
              maxWidth: "640px",
            }}
          >
            Join the waitlist and lock in your exclusive launch price, permanently below public plans.
          </p>

          <div className="max-w-xl mx-auto text-left">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* ── What you're getting access to ────────────────────────────────────── */}
      <section
        style={{
          background: "rgba(255,255,255,0.04)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          padding: "80px 24px",
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p
              className="font-semibold uppercase mb-3"
              style={{
                fontSize: "11px",
                letterSpacing: "0.14em",
                color: "var(--sage)",
              }}
            >
              What You&rsquo;re Getting Access To
            </p>
            <h2
              className="font-bold"
              style={{
                fontSize: "clamp(1.5rem, 3vw, 2rem)",
                lineHeight: 1.2,
                color: "white",
              }}
            >
              A Coffee-Specific Planning Platform, Shipped Today
            </h2>
            <p
              className="mx-auto mt-4"
              style={{
                fontSize: "16px",
                lineHeight: 1.55,
                maxWidth: "560px",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              Every feature below is live in the platform right now. Waitlist members get in first, at the lowest price.
            </p>
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-2xl p-6"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{
                    background:
                      f.accent === "sage"
                        ? "rgba(118,179,157,0.18)"
                        : "rgba(255,255,255,0.12)",
                    color: f.accent === "sage" ? "var(--sage)" : "white",
                  }}
                >
                  {f.icon}
                </div>
                <h3
                  className="font-semibold mb-2"
                  style={{
                    fontSize: "17px",
                    lineHeight: 1.3,
                    color: "white",
                  }}
                >
                  {f.title}
                </h3>
                <p
                  style={{
                    fontSize: "15px",
                    lineHeight: 1.55,
                    color: "rgba(255,255,255,0.78)",
                  }}
                >
                  {f.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.1)",
          padding: "32px 24px",
        }}
      >
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            &copy; {new Date().getFullYear()} Timberline Coffee School. Groundwork.AI is a product of Timberline Coffee School.
          </p>
          <nav className="flex items-center gap-5" aria-label="Footer">
            <Link
              href="/privacy"
              style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}
              className="hover:text-white"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}
              className="hover:text-white"
            >
              Terms
            </Link>
            <a
              href="mailto:hello@timberline.coffee"
              style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}
              className="hover:text-white"
            >
              Contact
            </a>
            <CookiePreferencesLink
              className="hover:text-white"
              style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}
            />
          </nav>
        </div>
      </footer>
    </main>
  );
}
