import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/app/_components/Logo";

export const metadata: Metadata = {
  title: "Groundwork | Links",
  description: "Planning tools for future coffee shop owners.",
  robots: { index: false },
};

const LINKS = [
  {
    label: "Start Your Coffee Shop Plan",
    href: "/signup?utm_source=instagram&utm_medium=bio&utm_campaign=linkinbio&utm_content=signup",
    primary: true,
    external: false,
  },
  {
    label: "Try Pro Free for 7 Days",
    href: "/trial?utm_source=instagram&utm_medium=bio&utm_campaign=linkinbio&utm_content=trial",
    primary: false,
    external: false,
  },
  {
    label: "See Pricing",
    href: "/pricing?utm_source=instagram&utm_medium=bio&utm_campaign=linkinbio&utm_content=pricing",
    primary: false,
    external: false,
  },
  {
    label: "Join Our Affiliate Program",
    href: "/affiliates?utm_source=instagram&utm_medium=bio&utm_campaign=linkinbio&utm_content=affiliate",
    primary: false,
    external: false,
  },
  {
    label: "Email Trent",
    href: "mailto:trentrollings@gmail.com",
    primary: false,
    external: true,
  },
] as const;

export default function LinksPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Link href="/" aria-label="Groundwork home">
            <Logo variant="color" height={36} priority />
          </Link>
        </div>

        {/* Tagline */}
        <p className="text-center text-sm text-[var(--muted-foreground)] mb-8">
          Planning tools for future coffee shop owners.
        </p>

        {/* Links */}
        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          {LINKS.map(({ label, href, primary, external }) => (
            <li key={href}>
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={[
                  "block w-full text-center text-sm font-semibold px-6 py-4 rounded-xl border transition-colors duration-150",
                  primary
                    ? "bg-[var(--teal)] text-white border-[var(--teal)] hover:bg-[var(--teal-dark)] hover:border-[var(--teal-dark)]"
                    : "bg-white text-[var(--teal)] border-[var(--border)] hover:border-[var(--teal)] hover:bg-[var(--teal-tint-100)]",
                ].join(" ")}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--muted-foreground)] mt-10">
          Timberline Coffee School
        </p>
      </div>
    </main>
  );
}
