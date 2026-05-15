import Link from "next/link";

export const metadata = {
  title: "Terms of Service — My Coffee Shop Consultant",
  description: "Terms of Service for Timberline Coffee School and My Coffee Shop Consultant.",
};

const EFFECTIVE_DATE = "May 15, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col">
      <header className="border-b border-[#efefef] bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#155e63] rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="font-semibold text-[#155e63]">Timberline Coffee School</span>
          </Link>
          <Link href="/" className="text-sm text-[#155e63] hover:underline">
            Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2">Terms of Service</h1>
        <p className="text-sm text-[#afafaf] mb-10">Effective {EFFECTIVE_DATE}</p>

        <div className="prose prose-sm max-w-none text-[#1a1a1a] space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Who we are</h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) are an agreement between you and
              Timberline Coffee School (&quot;Timberline,&quot; &quot;we,&quot; &quot;us&quot;), the operator of
              the My Coffee Shop Consultant platform at this website (the &quot;Service&quot;).
              By creating an account, accessing, or using the Service, you agree to these
              Terms and to our{" "}
              <Link href="/privacy" className="text-[#155e63] underline">
                Privacy Policy
              </Link>
              . If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Eligibility and accounts</h2>
            <p>
              You must be at least 18 years old and able to form a binding contract to use
              the Service. You are responsible for keeping your login credentials secure
              and for all activity under your account. Tell us promptly at{" "}
              <a href="mailto:hello@timberline.coffee" className="text-[#155e63] underline">
                hello@timberline.coffee
              </a>{" "}
              if you suspect unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. The Service</h2>
            <p>
              The Service helps prospective coffee shop owners plan their business through
              guided modules, AI-assisted coaching, and deliverable generation. The Service
              is provided for educational and planning purposes only. It is not legal,
              financial, tax, accounting, real estate, or professional advice. You are
              solely responsible for decisions you make about your business.
            </p>
            <p>
              We may add, change, or remove features, modules, or content at any time. We
              will give reasonable notice of material changes that adversely affect a paid
              plan you are then on.
            </p>
            <p>
              From time to time we may release features labeled &quot;beta,&quot;
              &quot;preview,&quot; or &quot;early access.&quot; Those features are provided
              as-is, may change or be removed at any time, and may not be as reliable as
              the rest of the Service. Service-level commitments, refund eligibility for
              beta-only failures, and indemnities in these Terms do not apply to beta
              features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Plans, billing, and renewals</h2>
            <p>
              Paid plans (currently &quot;Builder&quot; and &quot;Accelerator&quot;) are
              billed in advance on a monthly or annual cycle through our payment processor,
              Stripe. By starting a paid plan you authorize us, through Stripe, to charge
              your payment method on each renewal at the then-current price for your plan
              and billing interval, until you cancel.
            </p>
            <p>
              Prices, included credits, and feature lists are shown on our{" "}
              <Link href="/pricing" className="text-[#155e63] underline">
                Pricing page
              </Link>
              . We may change prices for future billing periods on at least 30 days&rsquo;
              notice; changes will not take effect for the current paid period.
            </p>
            <p>
              You can cancel at any time from your account&rsquo;s billing portal.
              Cancellation stops future renewals and takes effect at the end of your current
              paid period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Refunds</h2>
            <p>
              If you are not satisfied with a paid plan, contact us within 14 days of your
              first paid charge for that plan and we will refund that charge in full.
              Outside of that 14-day window, paid fees are non-refundable, including for
              partial billing periods, unused AI credits, or features you choose not to
              use. We may issue refunds at our discretion in cases of platform outage,
              billing error, or our material failure to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. AI features and credits</h2>
            <p>
              The Service uses third-party AI providers (currently Anthropic) to generate
              coaching responses, summaries, and other outputs (&quot;AI Output&quot;). AI
              Output can be inaccurate, incomplete, biased, or out of date. You should
              verify any AI Output before relying on it for business decisions.
            </p>
            <p>
              Builder plans include a monthly allocation of AI coaching credits.
              Unused credits do not roll over between billing periods. We may apply
              reasonable rate limits and abuse protections to prevent automated, scripted,
              or commercially-resold use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Service in violation of any law or third-party rights;</li>
              <li>
                Reverse engineer, scrape, crawl, or otherwise use automated means to
                extract source code, prompts, model weights, page content, or AI Output
                from the Service;
              </li>
              <li>
                Use the Service, Your Content (other than your own), or AI Output as
                training data, fine-tuning data, or evaluation data for any artificial
                intelligence or machine-learning model;
              </li>
              <li>
                Resell, sublicense, or share your account credentials, or use the Service
                to provide a substantially similar product to others;
              </li>
              <li>
                Upload content that is unlawful, infringing, harmful, or contains personal
                data of others without their permission;
              </li>
              <li>
                Use the Service to harass, defraud, or attempt to gain unauthorized access
                to any system, account, or data;
              </li>
              <li>
                Interfere with the Service&rsquo;s infrastructure, including by sending
                excessive requests, probing for vulnerabilities, or evading rate limits.
              </li>
            </ul>
            <p>We may suspend or terminate accounts that violate this section.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Your content</h2>
            <p>
              You own the business plan content, exercise responses, financial inputs, and
              other materials you submit to the Service (&quot;Your Content&quot;). You
              grant Timberline a worldwide, non-exclusive, royalty-free license to host,
              process, transmit, and display Your Content solely to provide the Service to
              you, to operate and improve the Service, and to comply with law.
            </p>
            <p>
              We do not use Your Content to train any first-party or third-party AI
              models. Aggregated, de-identified usage metrics (such as feature usage
              counts, latencies, and error rates) may be used to operate, secure, and
              improve the Service. We do not use the substance of your prompts, AI Output,
              plan inputs, or financial data to train models, whether ours or a vendor&rsquo;s.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Our intellectual property</h2>
            <p>
              The Service, including its software, prompts, module structure, copy,
              templates, designs, and brand assets, is owned by Timberline or its licensors
              and is protected by intellectual property law. We grant you a limited,
              non-exclusive, non-transferable, revocable license to use the Service for
              your internal coffee-shop planning purposes during your paid (or free)
              subscription. AI Output you generate while using the Service is yours to use
              for your own coffee-shop planning, subject to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Disclaimers</h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available.&quot; To
              the maximum extent permitted by law, Timberline disclaims all warranties,
              express or implied, including merchantability, fitness for a particular
              purpose, non-infringement, accuracy, and uninterrupted operation. We do not
              guarantee that the Service will meet your requirements, that AI Output will
              be accurate, or that your coffee shop will be profitable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, Timberline and its officers,
              employees, and contractors will not be liable for any indirect, incidental,
              special, consequential, exemplary, or punitive damages, or for lost profits,
              lost revenue, lost data, or business interruption, arising out of or in
              connection with the Service or these Terms, even if advised of the
              possibility of such damages.
            </p>
            <p>
              Our total cumulative liability for all claims arising out of or in connection
              with the Service or these Terms will not exceed the greater of (a) the
              amounts you paid Timberline for the Service in the 12 months immediately
              before the event giving rise to the claim, or (b) US$100.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Indemnification</h2>
            <p>
              You will indemnify and hold Timberline harmless from any third-party claims,
              damages, liabilities, and reasonable legal fees arising from (a) Your Content,
              (b) your use of the Service in violation of these Terms or applicable law, or
              (c) decisions you make about your business, including any reliance on AI
              Output.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Termination</h2>
            <p>
              You may stop using the Service at any time and delete your account by
              contacting us. We may suspend or terminate your access if you breach these
              Terms, if required by law, or if continuing to provide the Service to you
              would expose Timberline to legal or operational risk. Sections that by their
              nature should survive termination (including 8&ndash;12 and 15) will survive.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. If we make material changes, we
              will notify you by email or through the Service before they take effect.
              Continued use of the Service after the effective date constitutes acceptance
              of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">15. Governing law and disputes</h2>
            <p>
              These Terms are governed by the laws of the State of Oregon, USA, without
              regard to its conflict-of-laws principles. The exclusive venue for any
              dispute that is not subject to arbitration or small-claims court will be the
              state and federal courts located in Multnomah County, Oregon, and you and
              Timberline consent to the personal jurisdiction of those courts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">16. Contact</h2>
            <p>
              Questions about these Terms? Email{" "}
              <a href="mailto:hello@timberline.coffee" className="text-[#155e63] underline">
                hello@timberline.coffee
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="bg-[#1a1a1a] text-[#afafaf] px-6 py-6 text-sm">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <span>&copy; {new Date().getFullYear()} Timberline Coffee School</span>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <a href="mailto:hello@timberline.coffee" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
