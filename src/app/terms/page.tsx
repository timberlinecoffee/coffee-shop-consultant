import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Timberline Coffee School",
  description: "Terms of Service for Timberline Coffee School.",
};

const EFFECTIVE_DATE = "May 22, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <header className="border-b border-grey-light bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="font-semibold text-teal">Timberline Coffee School</span>
          </Link>
          <Link href="/" className="text-sm text-teal hover:underline">
            Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <h1 className="text-3xl font-bold text-neutral-950 mb-2">Terms of Service</h1>
        <p className="text-sm text-neutral-500 mb-10">Effective {EFFECTIVE_DATE}</p>

        <div className="prose prose-sm max-w-none text-neutral-950 space-y-8">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of Timberline Coffee School
            (&quot;Timberline&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) and the subscription-based
            platform available at timberlinecoffeeschool.com (the &quot;Service&quot;). By creating an
            account or using the Service, you agree to these Terms.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Your Account</h2>
            <p>
              You must be 18 years or older to create an account. You are responsible for keeping
              your login credentials confidential and for all activity that occurs under your account.
              Notify us immediately at{" "}
              <a href="mailto:support@timberlinecoffeeschool.com" className="text-teal underline">
                support@timberlinecoffeeschool.com
              </a>{" "}
              if you believe your account has been compromised.
            </p>
            <p className="mt-3">
              One account per person. You may not share, sell, or transfer your account to another person.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Use the Service for any unlawful purpose or in violation of these Terms.</li>
              <li>Copy, distribute, or reproduce course materials outside of your personal use.</li>
              <li>Attempt to reverse-engineer, scrape, or extract data from the platform.</li>
              <li>Upload or transmit content that is harmful, offensive, or infringes a third party&rsquo;s rights.</li>
              <li>Use automated tools, bots, or scripts to access the Service.</li>
            </ul>
            <p className="mt-3">We reserve the right to suspend or terminate accounts that violate these rules.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Intellectual Property</h2>
            <p>
              All content on the Service -- including course videos, written materials, exercises, and
              platform design -- is owned by Timberline Coffee School or our licensors and is protected
              by copyright and other intellectual property laws.
            </p>
            <p className="mt-3">
              Your subscription grants you a limited, non-exclusive, non-transferable license to access
              and use the content for your personal, non-commercial education. You do not acquire any
              ownership rights.
            </p>
            <p className="mt-3">
              User-generated content (such as forum posts or comments) remains yours. By posting it on
              the Service, you grant us a non-exclusive, royalty-free license to display and distribute
              it within the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Disclaimers</h2>
            <p>
              The Service and all content are provided &quot;as is&quot; without warranties of any kind,
              either express or implied. We do not warrant that the Service will be uninterrupted,
              error-free, or free of viruses.
            </p>
            <p className="mt-3">
              Coffee education is informational. We make no guarantees about employment outcomes,
              certification recognition, or business results from using the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, Timberline Coffee School, its officers, employees,
              and partners will not be liable for:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Any indirect, incidental, special, or consequential damages.</li>
              <li>Loss of profits, data, or goodwill.</li>
              <li>Damages resulting from unauthorized access to or alteration of your content.</li>
            </ul>
            <p className="mt-3">
              Our total liability for any claim arising from your use of the Service will not exceed the
              amount you paid us in the 12 months preceding the claim.
            </p>
            <p className="mt-3">
              Some jurisdictions do not allow certain liability limitations. In those cases, our liability
              is limited to the maximum extent permitted by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Colorado, without regard to its
              conflict-of-law principles. Any legal action arising from these Terms must be brought in
              the state or federal courts located in Denver, Colorado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Dispute Resolution</h2>
            <p>
              Before filing any formal legal claim, you agree to first contact us at{" "}
              <a href="mailto:legal@timberlinecoffeeschool.com" className="text-teal underline">
                legal@timberlinecoffeeschool.com
              </a>{" "}
              and give us 30 days to attempt to resolve the dispute informally.
            </p>
            <p className="mt-3">
              If informal resolution fails, any dispute will be resolved through binding individual
              arbitration administered by the American Arbitration Association under its Consumer
              Arbitration Rules. You waive any right to participate in a class action lawsuit or
              class-wide arbitration.
            </p>
            <p className="mt-3">
              Nothing in this section prevents either party from seeking injunctive relief in court for
              intellectual property infringement or unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. If we make material changes, we will notify
              you by email or by posting a notice on the Service at least 14 days before the changes
              take effect. Continued use of the Service after that date constitutes your acceptance of
              the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Contact</h2>
            <p>
              Timberline Coffee School
              <br />
              Email:{" "}
              <a href="mailto:legal@timberlinecoffeeschool.com" className="text-teal underline">
                legal@timberlinecoffeeschool.com
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="bg-neutral-950 text-neutral-500 px-6 py-6 text-sm">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <span>&copy; {new Date().getFullYear()} Timberline Coffee School</span>
          <div className="flex gap-6 flex-wrap justify-center">
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/subscription-terms" className="hover:text-white transition-colors">Subscription Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
