import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "../_components/Logo";
import { CookiePreferencesLink } from "@/components/consent/CookiePreferencesLink";

export const metadata = {
  title: "Privacy Policy | Ivy & Rill Consulting Inc.",
  description: "Privacy Policy for Ivy & Rill Consulting Inc.",
};

const EFFECTIVE_DATE = "June 30, 2026";

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
                ["Anthropic PBC", "Standard Contractual Clauses (SCCs) -- see anthropic.com/legal/dpa"],
                ["Resend, Inc.", "Standard Contractual Clauses (SCCs) -- see resend.com/dpa"],
                ["Klaviyo, Inc.", "EU-US Data Privacy Framework (adequacy decision -- Commission Implementing Decision 2023/1795); UK Extension to the DPF; Standard Contractual Clauses (SCCs) -- see klaviyo.com/legal/dpa"],
                ["Rewardful (if affiliate programme active)", "Standard Contractual Clauses (SCCs) -- see rewardful.com/privacy"],
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

          <section id="section-pipeda-cross-border">
            <h2 className="text-xl font-semibold mb-3">5. International Transfers of Personal Information (Canadian Users — PIPEDA)</h2>
            <p className="font-medium text-[var(--foreground)] mb-2">
              This section applies to individuals whose personal information is subject to Canada&rsquo;s{" "}
              <em>Personal Information Protection and Electronic Documents Act</em>, SC 2000, c 5
              (&ldquo;PIPEDA&rdquo;), Schedule&nbsp;1, Principle&nbsp;4.1.3.
            </p>
            <p className="mt-3">
              Groundwork is a cloud-based service. To deliver the platform, we engage third-party service
              providers (&ldquo;processors&rdquo;) who may operate servers or infrastructure outside Canada.
              We share your personal information with these processors only to the extent necessary to
              deliver the Service.
            </p>
            <p className="mt-3">
              Your personal information may be transferred to, and processed in, the following countries:
            </p>
            {(() => {
              const rows = [
                ["Vercel Inc.", "United States — application hosting and content delivery"],
                ["Anthropic PBC", "United States — AI language-model processing for the Groundwork CoPilot feature"],
                ["Supabase Inc.", "United States — database hosting and user authentication"],
                ["Stripe Inc.", "United States — payment processing and subscription management"],
                ["Resend Inc.", "United States — transactional email delivery"],
                ["Klaviyo Inc.", "United States — marketing email and customer communications; where Klaviyo’s EU data residency option is active, personal information of EU/UK-resident subscribers may also be processed in the European Union (Ireland)"],
              ];
              return (
                <>
                  <div className="hidden sm:block overflow-x-auto mt-3">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left">
                          <th className="py-2 pr-4 font-semibold align-top">Processor</th>
                          <th className="py-2 font-semibold align-top">Country and role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([processor, detail]) => (
                          <tr key={processor} className="border-b border-[var(--border)]">
                            <td className="py-2 pr-4 align-top"><strong>{processor}</strong></td>
                            <td className="py-2 align-top">{detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="sm:hidden mt-3 border-t border-[var(--border)]">
                    {rows.map(([processor, detail]) => (
                      <div key={processor} className="border-b border-[var(--border)] py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Processor</dt>
                        <dd className="text-sm mt-1"><strong>{processor}</strong></dd>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mt-2">Country and role</dt>
                        <dd className="text-sm mt-1">{detail}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              );
            })()}
            <p className="mt-3">
              For a full list of our sub-processors, see{" "}
              <Link href="/sub-processors" className="text-[var(--teal)] underline">
                groundwork.cafe/sub-processors
              </Link>
              . For data transferred to the People&rsquo;s Republic of China via the Groundwork Scout AI
              feature, see §7 (Scout AI and Cross-Border Data Transfer to China) below.
            </p>

            <h3 className="text-base font-semibold mt-4 mb-2">Foreign laws and authorities</h3>
            <p>
              When your personal information is transferred to another jurisdiction, it becomes subject to
              the laws of that country. Those laws may permit or require disclosure of your personal
              information to courts, law enforcement agencies, national security authorities, or other
              government bodies of that jurisdiction{" "}
              <strong>without notice to you and without your consent</strong>. We cannot guarantee that
              personal information processed outside Canada will receive protections equivalent to those
              under PIPEDA.
            </p>

            <h3 className="text-base font-semibold mt-4 mb-2">Safeguards we maintain</h3>
            <p>
              Before transferring your personal information to any processor, we enter into a data
              processing agreement that requires the processor to: use your personal information only for
              the purposes we specify; maintain appropriate technical and organisational security measures;
              notify us of any security breach or compelled-disclosure request; and delete or return
              personal information when the processing relationship ends. These obligations are consistent
              with PIPEDA Schedule&nbsp;1, Principle&nbsp;4.1.3. They do not, however, override the
              mandatory laws of the receiving country.
            </p>

            <h3 className="text-base font-semibold mt-4 mb-2">Questions about your data</h3>
            <p>
              You may contact our Privacy Officer at{" "}
              <a href="mailto:privacy@groundwork.cafe" className="text-[var(--teal)] underline">
                privacy@groundwork.cafe
              </a>{" "}
              at any time to ask which of your personal information has been transferred outside Canada and
              to which jurisdictions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Information We Share</h2>
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
                <strong>Anthropic PBC</strong> &mdash; our AI inference provider. When you use
                AI-powered features on the Service (such as personalized recommendations or
                interactive tools), the text of your query is sent to Anthropic&rsquo;s API for
                processing. We do not send your name, email address, or payment information to
                Anthropic. Anthropic&rsquo;s privacy policy is at{" "}
                <a href="https://www.anthropic.com/privacy" className="text-[var(--teal)] underline">
                  anthropic.com/privacy
                </a>
                .
              </li>
              <li>
                <strong>Resend, Inc.</strong> &mdash; our transactional email delivery provider.
                Resend receives your email address and the content of transactional messages (account
                confirmations, receipts, password resets) in order to deliver them on our behalf.
                Resend&rsquo;s privacy policy is at{" "}
                <a href="https://resend.com/legal/privacy-policy" className="text-[var(--teal)] underline">
                  resend.com/legal/privacy-policy
                </a>
                .
              </li>
              <li>
                <strong>Klaviyo, Inc.</strong> &mdash; our marketing email platform. If you have
                opted in to marketing communications, Klaviyo receives your email address and consent
                status in order to send, track, and manage marketing and onboarding emails on our
                behalf. You can opt out at any time via the unsubscribe link in any marketing email.
                Klaviyo&rsquo;s privacy policy is at{" "}
                <a href="https://www.klaviyo.com/legal/privacy" className="text-[var(--teal)] underline">
                  klaviyo.com/legal/privacy
                </a>
                .
              </li>
              <li>
                <strong>Rewardful</strong> &mdash; our affiliate-tracking platform (not yet
                active). If we launch an affiliate referral programme, Rewardful will receive
                referral attribution data (cookies and anonymised conversion identifiers) in order
                to track and pay commissions. If you sign up as an affiliate, your email address
                will also be shared with Rewardful. Rewardful&rsquo;s privacy policy is at{" "}
                <a href="https://www.rewardful.com/privacy" className="text-[var(--teal)] underline">
                  rewardful.com/privacy
                </a>
                .
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
            <h2 className="text-xl font-semibold mb-3">7. Scout AI and Cross-Border Data Transfer to China</h2>
            <p className="text-sm text-[var(--dark-grey)] mb-3">Last updated: {EFFECTIVE_DATE}</p>
            <p>
              Groundwork&rsquo;s Scout AI assistant is powered in part by AI models provided by{" "}
              <strong>DeepSeek</strong> (Hangzhou DeepSeek Artificial Intelligence Basic Technology
              Research Co., Ltd., Hangzhou, People&rsquo;s Republic of China).
            </p>
            <p className="mt-3">
              <strong>What data is sent to DeepSeek.</strong> When you use Scout, the text you type into
              Scout (your prompts) and Scout&rsquo;s AI-generated responses are processed by
              DeepSeek&rsquo;s servers to produce each response. This may include business information
              you share &mdash; descriptions of your coffee shop, questions about operations, financial
              details, or staffing information you include in your prompts.
            </p>
            <p className="mt-3">
              <strong>Where your data goes.</strong> DeepSeek processes and stores this data on servers
              located in mainland China (Hangzhou). DeepSeek does not offer a hosting option outside
              China for its hosted API.
            </p>
            <p className="mt-3">
              <strong>Chinese law and government access.</strong> Data on servers in mainland China is
              subject to Chinese national law, including China&rsquo;s National Intelligence Law (2017),
              Cybersecurity Law (2017), and Data Security Law (2021). These laws can require DeepSeek to
              hand data to Chinese government authorities on request. This obligation applies regardless
              of any agreement between Groundwork and DeepSeek &mdash; no contract can override it. We
              are telling you this plainly because you have the right to know before you use this
              feature.
            </p>
            <p className="mt-3">
              <strong>Model training.</strong> By default, DeepSeek may use Scout prompts and responses
              to train or improve its AI models. DeepSeek applies de-identification before doing so, but
              this process is not independently audited. We do not currently have an enforceable
              mechanism to exclude your data from this use.
            </p>
            <p className="mt-3">
              If you would like to request that your data not be used for model training, contact us at{" "}
              <a href="mailto:privacy@groundwork.cafe" className="text-[var(--teal)] underline">
                privacy@groundwork.cafe
              </a>
              . We will submit your request to DeepSeek on your behalf. Because no verified opt-out
              mechanism exists for API customers, we cannot guarantee this request will be honoured, and
              we will tell you that clearly if we receive a response.
            </p>
            <p className="mt-3">
              <strong>How long your data is kept.</strong> DeepSeek has not publicly disclosed a
              specific retention period for AI API request data. Until we receive written confirmation
              otherwise, you should treat your Scout data as potentially retained indefinitely on
              DeepSeek&rsquo;s servers.
            </p>
            <p className="mt-3">
              <strong>Your options.</strong> Scout does not currently offer a model-selection setting
              that lets you route requests to an alternative AI provider. If we add that capability, we
              will update this section. In the meantime, if you prefer that your Scout inputs not be
              processed in China, the current option is to avoid using the Scout AI feature.
            </p>
            <p className="mt-3">
              <strong>Our accountability.</strong> Even though DeepSeek processes your data on our
              behalf, Groundwork (Ivy &amp; Rill Consulting Inc.) remains responsible for your personal
              information and for how our sub-processors handle it. If you have questions or concerns,
              contact us at{" "}
              <a href="mailto:privacy@groundwork.cafe" className="text-[var(--teal)] underline">
                privacy@groundwork.cafe
              </a>
              .
            </p>
            <p className="mt-3">
              For a full list of our sub-processors, see{" "}
              <Link href="/sub-processors" className="text-[var(--teal)] underline">
                groundwork.cafe/sub-processors
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Data Retention</h2>
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
            <h2 className="text-xl font-semibold mb-3">9. Your Rights</h2>
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
            <h2 className="text-xl font-semibold mb-3">
              10. Complaints, Questions, and the Right to File with a Regulator (Canada &mdash; PIPEDA)
            </h2>
            <p>
              If you are located in Canada, the <em>Personal Information Protection and Electronic
              Documents Act</em> (PIPEDA) gives you the right to raise concerns about how we collect, use,
              or disclose your personal information.
            </p>

            <h3 className="text-base font-semibold mt-4 mb-2">Step 1 &mdash; Contact Groundwork directly.</h3>
            <p>We ask that you first bring your concern to us so we have the opportunity to address it:</p>
            <ul className="list-none space-y-2 mt-2">
              <li>
                <strong>Email:</strong>{" "}
                <a href="mailto:privacy@groundwork.cafe" className="text-[var(--teal)] underline">
                  privacy@groundwork.cafe
                </a>
              </li>
              <li>
                <strong>Subject line:</strong> &ldquo;Privacy Complaint &mdash; [your name / account email]&rdquo;
              </li>
              <li>
                <strong>What to include:</strong> A description of the information at issue, the concern
                you have, and the outcome you are seeking.
              </li>
            </ul>
            <p className="mt-3">
              We will acknowledge your complaint within <strong>5 business days</strong> and provide a
              written response within <strong>30 calendar days</strong>. If we need more time, we will
              notify you of the extension and the reason for it.
            </p>

            <h3 className="text-base font-semibold mt-4 mb-2">Step 2 &mdash; Escalation within Groundwork.</h3>
            <p>
              If you are not satisfied with the initial response, you may request escalation to our
              designated Privacy Officer:
            </p>
            <p className="mt-2">
              <strong>Privacy Officer, Ivy &amp; Rill Consulting Inc. (operating as Groundwork)</strong>
              <br />
              Email:{" "}
              <a href="mailto:privacy@groundwork.cafe" className="text-[var(--teal)] underline">
                privacy@groundwork.cafe
              </a>
              <br />
              Response time: 30 calendar days from escalation request.
            </p>

            <h3 className="text-base font-semibold mt-4 mb-2">
              Step 3 &mdash; File a complaint with the Office of the Privacy Commissioner of Canada (OPC).
            </h3>
            <p>
              Under PIPEDA s.11, you have the right to file a complaint directly with the OPC at any time.
              You do not need to contact us first before going to the OPC, although we encourage you to do
              so.
            </p>
            <p className="mt-3">
              If our internal process does not resolve your concern, or if you prefer to proceed directly:
            </p>
            {(() => {
              const rows: Array<[string, ReactNode]> = [
                [
                  "Online complaint form",
                  <a
                    key="opc-form"
                    href="https://www.priv.gc.ca/en/report-a-concern/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--teal)] underline"
                  >
                    priv.gc.ca/en/report-a-concern/
                  </a>,
                ],
                [
                  "Mail",
                  "Office of the Privacy Commissioner of Canada, 30 Victoria Street, Gatineau, Quebec K1A 1H3",
                ],
                ["Toll-free (Canada)", "1-800-282-1376"],
                ["Fax", "819-994-5424"],
                ["TTY", "819-994-6591"],
              ];
              return (
                <>
                  <div className="hidden sm:block overflow-x-auto mt-3">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left">
                          <th className="py-2 pr-4 font-semibold align-top">Contact method</th>
                          <th className="py-2 font-semibold align-top">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([method, details]) => (
                          <tr key={method} className="border-b border-[var(--border)]">
                            <td className="py-2 pr-4 align-top"><strong>{method}</strong></td>
                            <td className="py-2 align-top">{details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="sm:hidden mt-3 border-t border-[var(--border)]">
                    {rows.map(([method, details]) => (
                      <div key={method} className="border-b border-[var(--border)] py-3">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                          Contact method
                        </dt>
                        <dd className="text-sm mt-1"><strong>{method}</strong></dd>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mt-2">
                          Details
                        </dt>
                        <dd className="text-sm mt-1">{details}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              );
            })()}
            <p className="mt-3">
              The OPC will investigate complaints about PIPEDA compliance. Following an OPC investigation,
              you may also have the right under PIPEDA s.14 to apply to the Federal Court of Canada for a
              remedy if the matter remains unresolved.
            </p>
            <p className="mt-3 text-sm text-[var(--dark-grey)]">
              This section applies to personal information processed in connection with commercial
              activity in Canada. For rights available to residents of the European Union, UK, California,
              or other jurisdictions, see the relevant sections of this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Cookies and Your Choices</h2>
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
            <h2 className="text-xl font-semibold mb-3">12. Security</h2>
            <p>
              We use industry-standard security measures including encryption in transit (TLS) and at
              rest, access controls, and regular security reviews. No method of transmission over the
              internet is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Children</h2>
            <p>
              The Service is not directed to children under 13. We do not knowingly collect personal
              information from children under 13. If you believe we have collected such information,
              please contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes, we will
              notify you by email at least 14 days before the changes take effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">15. Contact</h2>
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
