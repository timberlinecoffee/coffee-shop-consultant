import Link from "next/link";
import { Logo } from "../_components/Logo";
import { CookiePreferencesLink } from "@/components/consent/CookiePreferencesLink";

export const metadata = {
  title: "Sub-Processors | Groundwork",
  description:
    "The companies that process data on behalf of Groundwork (Ivy & Rill Consulting Inc.), what they do, where they process, and the safeguards in place.",
};

const LAST_UPDATED = "June 30, 2026";
// Last revision: TIM-3471 — DeepSeek Safeguards now confirms the EU geo-gate
// is live (TIM-3460 PR-A shipped /sub-processors without the gate sentence
// because the router wiring had not landed yet).

type Row = {
  vendor: string;
  purpose: string;
  dataCategories: string;
  region: string;
  safeguards: string;
};

const ROWS: Row[] = [
  {
    vendor:
      "Anthropic, PBC",
    purpose:
      "AI inference for the Scout assistant and other AI-powered features (Claude models)",
    dataCategories:
      "Scout prompts and AI-generated responses; business operational data included in prompts",
    region: "United States",
    safeguards:
      "Data Processing Agreement executed. Anthropic does not use API content to train its models. Standard Contractual Clauses available for EEA/UK transfers.",
  },
  {
    vendor:
      "Hangzhou DeepSeek Artificial Intelligence Basic Technology Research Co., Ltd. (DeepSeek API)",
    purpose:
      "Scout AI inference — processes Scout prompts and generates AI responses for selected request types",
    dataCategories:
      "Scout text inputs (user queries to Scout); AI-generated outputs; business operational data included in prompts",
    region: "People’s Republic of China — Hangzhou",
    safeguards:
      "Disclosure and consent in Privacy Policy (PIPEDA Principles 1, 4.3, and 4.8). No Data Processing Agreement executed (none offered by DeepSeek). No Standard Contractual Clauses or adequacy decision available. Chinese state-access risk (National Intelligence Law 2017, Cybersecurity Law 2017, Data Security Law 2021) explicitly disclosed in Privacy Policy. EU users excluded from DeepSeek routing via geo-gate.",
  },
  {
    vendor: "Supabase Inc.",
    purpose:
      "Cloud database, authentication, and storage for account, learning progress, and product data",
    dataCategories:
      "Account information (name, email, hashed password); learning progress and usage data; user-generated content saved in the product",
    region: "United States",
    safeguards:
      "Data Processing Agreement executed (Supabase Module 2 DPA). Standard Contractual Clauses for EEA/UK transfers. Row-level security enforced at the database layer.",
  },
  {
    vendor: "Stripe, Inc.",
    purpose: "Subscription billing and payment processing",
    dataCategories:
      "Billing name, last four digits of card, transaction identifiers, subscription status",
    region: "United States",
    safeguards:
      "Data Processing Agreement executed. EU-US Data Privacy Framework adequacy decision (Commission Implementing Decision 2023/1795); Standard Contractual Clauses for transfers from the UK and Switzerland (see stripe.com/legal/dpa).",
  },
  {
    vendor: "Google LLC",
    purpose:
      "Google Analytics 4 (usage analytics, consent-gated) and Google Ads (advertising measurement, consent-gated)",
    dataCategories:
      "IP address (anonymized), device and browser type, page interactions; advertising identifiers if marketing cookies are accepted",
    region: "United States",
    safeguards:
      "Data Processing Terms executed (Google Ads DPT + GA4 DPA). EU-US Data Privacy Framework adequacy decision (Commission Implementing Decision 2023/1795); UK Extension to the DPF. Set only after the visitor consents to the relevant cookie category.",
  },
  {
    vendor: "Meta Platforms, Inc.",
    purpose:
      "Meta Pixel and Conversions API for advertising measurement (consent-gated)",
    dataCategories:
      "Hashed email or phone (SHA-256 before transmission), event data, advertising identifiers",
    region: "United States",
    safeguards:
      "EU-US Data Privacy Framework adequacy decision (Commission Implementing Decision 2023/1795); UK Extension to the DPF. Set only after the visitor consents to marketing cookies. Personal identifiers are SHA-256 hashed before they leave our servers.",
  },
  {
    vendor: "Resend",
    purpose:
      "Transactional and account email delivery (sign-up confirmations, password resets, receipts)",
    dataCategories:
      "Recipient email address, email subject and body, delivery metadata",
    region: "United States",
    safeguards:
      "Data Processing Agreement executed. Standard Contractual Clauses for EEA/UK transfers.",
  },
  {
    vendor: "Vercel Inc.",
    purpose: "Application hosting and edge delivery",
    dataCategories:
      "Standard request metadata (IP address, user agent, request path) for delivery and abuse prevention",
    region: "United States (multi-region edge)",
    safeguards:
      "Data Processing Agreement executed. Standard Contractual Clauses for EEA/UK transfers.",
  },
];

export default function SubProcessorsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="Groundwork home">
            <Logo variant="color" height={30} />
          </Link>
          <Link href="/privacy" className="text-sm text-[var(--teal)] hover:underline">
            Back to Privacy Policy
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Sub-Processors</h1>
        <p className="text-sm text-[var(--dark-grey)] mb-10">Last updated {LAST_UPDATED}</p>

        <div className="prose prose-sm max-w-none text-[var(--foreground)] space-y-6">
          <p>
            Groundwork (operated by Ivy &amp; Rill Consulting Inc.) uses the sub-processors below to
            operate the Service. A sub-processor is a company that processes personal information on
            our behalf so we can deliver Groundwork to you. We update this page before we add a new
            sub-processor.
          </p>
          <p>
            For background on how we collect, use, and share data, see the{" "}
            <Link href="/privacy" className="text-[var(--teal)] underline">
              Privacy Policy
            </Link>
            .
          </p>

          <div className="hidden md:block overflow-x-auto mt-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-left align-top">
                  <th className="py-2 pr-4 font-semibold">Vendor</th>
                  <th className="py-2 pr-4 font-semibold">Purpose</th>
                  <th className="py-2 pr-4 font-semibold">Data categories</th>
                  <th className="py-2 pr-4 font-semibold">Region</th>
                  <th className="py-2 font-semibold">Safeguards</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.vendor} className="border-b border-[var(--border)] align-top">
                    <td className="py-3 pr-4"><strong>{row.vendor}</strong></td>
                    <td className="py-3 pr-4">{row.purpose}</td>
                    <td className="py-3 pr-4">{row.dataCategories}</td>
                    <td className="py-3 pr-4">{row.region}</td>
                    <td className="py-3">{row.safeguards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="md:hidden mt-6 border-t border-[var(--border)]">
            {ROWS.map((row) => (
              <div key={row.vendor} className="border-b border-[var(--border)] py-4">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Vendor
                </dt>
                <dd className="text-sm mt-1"><strong>{row.vendor}</strong></dd>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mt-3">
                  Purpose
                </dt>
                <dd className="text-sm mt-1">{row.purpose}</dd>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mt-3">
                  Data categories
                </dt>
                <dd className="text-sm mt-1">{row.dataCategories}</dd>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mt-3">
                  Region
                </dt>
                <dd className="text-sm mt-1">{row.region}</dd>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mt-3">
                  Safeguards
                </dt>
                <dd className="text-sm mt-1">{row.safeguards}</dd>
              </div>
            ))}
          </dl>

          <h2 className="text-xl font-semibold mt-10 mb-3">Notice of changes</h2>
          <p>
            We will update this page when we add, remove, or change a sub-processor. Material changes
            to AI sub-processors (for example, adding a new AI model provider in a new jurisdiction)
            will also be reflected in the{" "}
            <Link href="/privacy" className="text-[var(--teal)] underline">
              Privacy Policy
            </Link>
            .
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">Contact</h2>
          <p>
            Questions about a sub-processor or how your data is processed? Email{" "}
            <a href="mailto:privacy@groundwork.cafe" className="text-[var(--teal)] underline">
              privacy@groundwork.cafe
            </a>
            .
          </p>
        </div>
      </main>

      <footer className="bg-[var(--foreground)] text-[var(--dark-grey)] px-6 py-6 text-sm">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <span>&copy; {new Date().getFullYear()} Ivy &amp; Rill Consulting Inc.</span>
          <div className="flex gap-6 flex-wrap justify-center">
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/sub-processors" className="hover:text-white transition-colors">Sub-Processors</Link>
            <Link href="/subscription-terms" className="hover:text-white transition-colors">Subscription Terms</Link>
            <CookiePreferencesLink className="hover:text-white transition-colors" />
          </div>
        </div>
      </footer>
    </div>
  );
}
