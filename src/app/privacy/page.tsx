import Link from "next/link";
import { Logo } from "../_components/Logo";
import { CookiePreferencesLink } from "@/components/consent/CookiePreferencesLink";

export const metadata = {
  title: "Privacy Policy | Ivy & Rill Consulting Inc.",
  description: "Privacy Policy for Ivy & Rill Consulting Inc.",
};

const EFFECTIVE_DATE = "June 2, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="Groundwork home">
            <Logo variant="color" height={30} />
          </Link>
          <Link href="/" className="text-sm text-[var(--teal)] hover:underline">
            Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Privacy Policy</h1>
        <p className="text-sm text-[var(--dark-grey)] mb-10">Effective {EFFECTIVE_DATE}</p>

        <div className="prose prose-sm max-w-none text-[var(--foreground)] space-y-8">
          <p>
            Ivy &amp; Rill Consulting Inc. (&quot;Ivy &amp; Rill&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the
            Groundwork platform at groundwork.coffee. We are committed to protecting your privacy. This
            Privacy Policy explains what information we collect, how we use it, and your rights regarding
            that information.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
            <ul className="list-none space-y-3">
              <li>
                <strong>Account information.</strong> When you create an account, we collect your name,
                email address, and password (hashed).
              </li>
              <li>
                <strong>Payment information.</strong> Payments are processed by Stripe. We do not store
                your full card number or CVV. We receive and retain a payment record including billing
                name, last 4 digits of the card, transaction ID, and subscription status from Stripe.
              </li>
              <li>
                <strong>Usage data.</strong> We collect information about how you use the Service,
                including lessons viewed, progress milestones, session timestamps, and feature
                interactions.
              </li>
              <li>
                <strong>Device and technical data.</strong> We automatically collect your IP address,
                browser type, operating system, and referring URLs when you visit the Service.
              </li>
              <li>
                <strong>Advertising and analytics identifiers.</strong> If you consent to analytics or
                marketing cookies, we and our advertising partners may set cookies and similar
                identifiers (such as the Meta Pixel and Google tags) to measure site usage and the
                performance of our ads. We do not set these until you have given consent.
              </li>
              <li>
                <strong>Communications.</strong> If you contact support or submit feedback, we retain
                those communications.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Create and manage your account.</li>
              <li>Process your subscription payments.</li>
              <li>Deliver and improve the Service and course content.</li>
              <li>Send transactional emails (receipts, password resets, account notices).</li>
              <li>Send marketing emails if you have opted in (you can opt out at any time).</li>
              <li>
                Measure and improve our advertising, where you have consented to marketing or analytics
                cookies.
              </li>
              <li>Detect and prevent fraud and abuse.</li>
              <li>Comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Legal Basis for Processing (EU/EEA/UK visitors)</h2>
            <p>
              For visitors in the European Economic Area (EEA) or United Kingdom (UK), applicable
              data-protection law requires us to state a legal basis for each processing activity. The
              relevant bases are:
            </p>
            {(() => {
              const rows = [
                ["Creating and managing your account", "Performance of contract -- Art. 6(1)(b) GDPR"],
                ["Processing subscription payments", "Performance of contract -- Art. 6(1)(b) GDPR"],
                ["Sending transactional emails (receipts, resets, notices)", "Performance of contract -- Art. 6(1)(b) GDPR"],
                ["Delivering and improving the Service and course content", "Legitimate interests -- Art. 6(1)(f) GDPR (our interest in providing a working, improving product)"],
                ["Analytics cookies (e.g. Google Analytics 4)", "Your consent -- Art. 6(1)(a) GDPR"],
                ["Marketing / advertising cookies and CAPI (Meta, Google Ads)", "Your consent -- Art. 6(1)(a) GDPR"],
                ["Hashed-PII sharing with Meta / Google for ad measurement", "Your consent -- Art. 6(1)(a) GDPR"],
                ["Sending marketing emails", "Your consent -- Art. 6(1)(a) GDPR"],
                ["Fraud prevention and security", "Legitimate interests -- Art. 6(1)(f) GDPR (our interest in protecting the Service and users)"],
                ["Complying with legal obligations", "Legal obligation -- Art. 6(1)(c) GDPR"],
              ];
              return (
                <>
                  <div className="hidden sm:block overflow-x-auto mt-3">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left">
                          <th className="py-2 pr-4 font-semibold align-top">Processing activity</th>
                          <th className="py-2 font-semibold align-top">Legal basis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([activity, basis]) => (
                          <tr key={activity} className="border-b border-[var(--border)]">
                            <td className="py-2 pr-4 align-top">{activity}</td>
                            <td className="py-2 align-top">{basis}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="sm:hidden mt-3 border-t border-[var(--border)]">
                    {rows.map(([activity, basis]) => (
                      <div key={activity} className="border-b border-[var(--border)] py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Processing activity</dt>
                        <dd className="text-sm mt-1">{activity}</dd>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mt-2">Legal basis</dt>
                        <dd className="text-sm mt-1">{basis}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              );
            })()}
            <p className="mt-3">
              Where we rely on legitimate interests, you have the right to object to that processing (see
              Your Rights).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. International Data Transfers (EU/EEA/UK visitors)</h2>
            <p>
              Ivy &amp; Rill Consulting Inc. is operated in the United States. When you use the Service, your
              personal data may be transferred to and processed in the United States.
            </p>
            <p className="mt-3">
              We share certain data with the following US-based third parties and rely on the following
              transfer mechanisms for transfers from the EEA or UK:
            </p>
            {(() => {
              const rows = [
                ["Meta Platforms, Inc.", "EU-US Data Privacy Framework (adequacy decision -- Commission Implementing Decision 2023/1795); UK Extension to the DPF"],
                ["Google LLC", "EU-US Data Privacy Framework (adequacy decision -- Commission Implementing Decision 2023/1795); UK Extension to the DPF"],
                ["Stripe, Inc.", "Standard Contractual Clauses (SCCs) / EU-US DPF -- see stripe.com/legal/dpa"],
                ["Supabase", "Standard Contractual Clauses (SCCs) -- see supabase.com/privacy"],
              ];
              return (
                <>
                  <div className="hidden sm:block overflow-x-auto mt-3">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left">
                          <th className="py-2 pr-4 font-semibold align-top">Recipient</th>
                          <th className="py-2 font-semibold align-top">Transfer mechanism</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([recipient, mechanism]) => (
                          <tr key={recipient} className="border-b border-[var(--border)]">
                            <td className="py-2 pr-4 align-top"><strong>{recipient}</strong></td>
                            <td className="py-2 align-top">{mechanism}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="sm:hidden mt-3 border-t border-[var(--border)]">
                    {rows.map(([recipient, mechanism]) => (
                      <div key={recipient} className="border-b border-[var(--border)] py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Recipient</dt>
                        <dd className="text-sm mt-1"><strong>{recipient}</strong></dd>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mt-2">Transfer mechanism</dt>
                        <dd className="text-sm mt-1">{mechanism}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              );
            })()}
            <p className="mt-3">
              You may request a copy of the relevant transfer safeguards by contacting us at{" "}
              <a href="mailto:hello@timberline.coffee" className="text-[var(--teal)] underline">
                hello@timberline.coffee
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Information We Share</h2>
            <p>We do not sell your personal information. We share it only as follows:</p>
            <ul className="list-none space-y-3 mt-3">
              <li>
                <strong>Stripe</strong> -- to process and manage subscription payments. Stripe&rsquo;s
                privacy policy is at stripe.com/privacy.
              </li>
              <li>
                <strong>Supabase</strong> -- our cloud database and authentication provider stores your
                account and usage data on our behalf.
              </li>
              <li>
                <strong>AI provider(s)</strong> -- certain features (such as personalized
                recommendations or interactive tools) may send anonymized or pseudonymized usage data to
                AI processing services. We do not send your name, email, or payment information to AI
                providers.
              </li>
              <li>
                <strong>Meta (Facebook).</strong> If you consent to marketing cookies, we use the Meta
                Pixel and the Meta Conversions API to measure the performance of our advertising. Any
                personal data we send to Meta through the Conversions API (such as email or phone) is
                SHA-256 hashed before it leaves our servers, so Meta does not receive it in readable
                form. Meta&rsquo;s data policy is at facebook.com/privacy/policy.
              </li>
              <li>
                <strong>Google.</strong> If you consent to analytics or marketing cookies, we use Google
                Analytics 4 and Google Ads to understand site usage and measure ad performance. IP
                addresses are anonymized for analytics. Google&rsquo;s privacy policy is at
                policies.google.com/privacy.
              </li>
              <li>
                <strong>Legal and safety.</strong> We may disclose information if required by law,
                court order, or to protect the rights and safety of Ivy &amp; Rill, our users, or the
                public.
              </li>
              <li>
                <strong>Business transfers.</strong> If Ivy &amp; Rill is acquired or merges with another
                company, your information may be transferred as part of that transaction. We will notify
                you in advance.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <p>
              We retain your account information for as long as your account is active, plus up to 3
              years after closure for legal and audit purposes. Payment records are retained as required
              by law (typically 7 years). You may request deletion at any time (see Your Rights below).
            </p>
            <p className="mt-3">
              Analytics and advertising data is retained only with your consent. Google Analytics user
              and event data is retained for up to 14 months. Hashed identifiers sent to advertising
              partners are transmitted for measurement and are not stored by us in a separate profile.
              Meta and Google retain the data they receive according to their own retention policies.
              Your consent choice is stored for up to 12 months, after which we ask again.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
            <p>Depending on where you live, you may have rights to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Access the personal information we hold about you.</li>
              <li>Correct inaccurate information.</li>
              <li>Request deletion of your information.</li>
              <li>Object to or restrict certain processing.</li>
              <li>Export your data in a portable format.</li>
              <li>Opt out of marketing emails at any time via the unsubscribe link or by contacting us.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{" "}
              <a href="mailto:hello@timberline.coffee" className="text-[var(--teal)] underline">
                hello@timberline.coffee
              </a>
              . We will respond within 30 days.
            </p>
            <p className="mt-4 font-semibold">EEA/UK visitors -- additional rights:</p>
            <p className="mt-2">If you are located in the EEA or UK, you also have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                <strong>Lodge a complaint</strong> with your local data-protection supervisory authority.
                In the EU, you can find your authority at{" "}
                <a
                  href="https://edpb.europa.eu/about-edpb/board/members_en"
                  className="text-[var(--teal)] underline"
                >
                  edpb.europa.eu/about-edpb/board/members_en
                </a>
                . In the UK, the supervisory authority is the Information Commissioner&rsquo;s Office (
                <a href="https://ico.org.uk" className="text-[var(--teal)] underline">
                  ico.org.uk
                </a>
                ).
              </li>
              <li>
                <strong>Withdraw consent</strong> at any time where we process your data on the basis of
                consent. Withdrawal does not affect the lawfulness of processing carried out before
                withdrawal. To withdraw cookie consent, use the <strong>Cookie Preferences</strong> link
                in the site footer, or clear the <code>gw_consent</code> cookie in your browser settings.
                To withdraw marketing email consent, use the unsubscribe link in any marketing email or
                contact us.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Cookies and Your Choices</h2>
            <p>We group cookies and similar technologies into three categories:</p>
            <ul className="list-none space-y-3 mt-3">
              <li>
                <strong>Necessary.</strong> Required to keep you logged in, remember your preferences,
                and secure the Service. These are always on and cannot be turned off.
              </li>
              <li>
                <strong>Analytics.</strong> Help us understand how the Service is used so we can improve
                it (for example, Google Analytics). Set only with your consent.
              </li>
              <li>
                <strong>Marketing.</strong> Let us measure the performance of our advertising (for
                example, the Meta Pixel, the Meta Conversions API, and Google Ads). Set only with your
                consent.
              </li>
            </ul>
            <p className="mt-3">
              When you first visit, a banner lets you accept all cookies or choose necessary only. We do
              not load analytics or marketing cookies until you have made a choice and given consent.
              You can change your choice at any time by clicking the <strong>Cookie Preferences</strong>{" "}
              link in the site footer of any page, which will reopen the consent banner. You can also
              clear the <code>gw_consent</code> cookie in your browser settings, or contact us. Disabling
              necessary cookies through your browser may affect some Service features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Security</h2>
            <p>
              We use industry-standard security measures including encryption in transit (TLS) and at
              rest, access controls, and regular security reviews. No method of transmission over the
              internet is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Children</h2>
            <p>
              The Service is not directed to children under 13. We do not knowingly collect personal
              information from children under 13. If you believe we have collected such information,
              please contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes, we will
              notify you by email at least 14 days before the changes take effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Contact</h2>
            <p>
              Ivy &amp; Rill Consulting Inc.
              <br />
              Email:{" "}
              <a href="mailto:hello@timberline.coffee" className="text-[var(--teal)] underline">
                hello@timberline.coffee
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="bg-[var(--foreground)] text-[var(--dark-grey)] px-6 py-6 text-sm">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <span>&copy; {new Date().getFullYear()} Ivy &amp; Rill Consulting Inc.</span>
          <div className="flex gap-6 flex-wrap justify-center">
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/subscription-terms" className="hover:text-white transition-colors">Subscription Terms</Link>
            <CookiePreferencesLink className="hover:text-white transition-colors" />
          </div>
        </div>
      </footer>
    </div>
  );
}
