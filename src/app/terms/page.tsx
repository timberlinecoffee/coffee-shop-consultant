import Link from "next/link";
import { CookiePreferencesLink } from "@/components/consent/CookiePreferencesLink";

export const metadata = {
  title: "Terms of Service | Ivy & Rill Consulting Inc.",
  description: "Terms of Service for Ivy & Rill Consulting Inc.",
};

const EFFECTIVE_DATE = "May 22, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--teal)] rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="font-semibold text-[var(--teal)]">Ivy &amp; Rill Consulting Inc.</span>
          </Link>
          <Link href="/" className="text-sm text-[var(--teal)] hover:underline">
            Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Terms of Service</h1>
        <p className="text-sm text-[var(--dark-grey)] mb-10">Effective {EFFECTIVE_DATE}</p>

        <div className="prose prose-sm max-w-none text-[var(--foreground)] space-y-8">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of Ivy &amp; Rill Consulting Inc.
            (&quot;Ivy &amp; Rill&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) and the subscription-based
            platform available at timberlinecoffeeschool.com (the &quot;Service&quot;). By creating an
            account or using the Service, you agree to these Terms.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Your Account</h2>
            <p>
              You must be 18 years or older to create an account. You are responsible for keeping
              your login credentials confidential and for all activity that occurs under your account.
              Notify us immediately at{" "}
              <a href="mailto:hello@timberline.coffee" className="text-[var(--teal)] underline">
                hello@timberline.coffee
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
              platform design -- is owned by Ivy &amp; Rill Consulting Inc. or our licensors and is protected
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
              To the fullest extent permitted by law, Ivy &amp; Rill Consulting Inc., its officers, employees,
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
              These Terms are governed by and construed in accordance with the laws of the Province of
              Alberta and the applicable federal laws of Canada, without regard to any conflict-of-law
              principles that would cause the laws of another jurisdiction to apply. The United Nations
              Convention on Contracts for the International Sale of Goods does not apply to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Dispute Resolution</h2>
            <p>
              <strong>Informal Resolution.</strong> Before commencing any formal proceeding, you agree
              to contact us at{" "}
              <a href="mailto:hello@timberline.coffee" className="text-[var(--teal)] underline">
                hello@timberline.coffee
              </a>{" "}
              and attempt to resolve the dispute informally. If the dispute is not resolved within
              thirty (30) days of first contact, either party may proceed as set out below.
            </p>
            <p className="mt-3">
              <strong>Binding Arbitration.</strong> Subject to the consumer-law qualifications in this
              section, any dispute, claim, or controversy arising out of or relating to these Terms,
              the Service, or its subject matter or formation (including non-contractual disputes) that
              is not resolved informally shall be finally determined by binding arbitration administered
              by the ADR Institute of Canada, Inc. (&quot;ADRIC&quot;) under its National Arbitration
              Rules (as amended from time to time), which rules are deemed incorporated by reference.
              The arbitration shall be:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>conducted in the English language;</li>
              <li>seated and held in Calgary, Alberta, Canada (or via videoconference by mutual agreement);</li>
              <li>decided by a single arbitrator, appointed in accordance with ADRIC rules; and</li>
              <li>confidential, except as necessary to enforce an award.</li>
            </ul>
            <p className="mt-3">
              Each party shall bear its own legal costs. The ADRIC administrative fees shall be
              allocated per ADRIC rules. The arbitral award shall be final and binding and may be
              entered and enforced in any court of competent jurisdiction.
            </p>
            <p className="mt-3">
              <strong>Injunctive Relief Exception.</strong> Nothing in this section prevents either
              party from seeking urgent or interim injunctive or other equitable relief from a court of
              competent jurisdiction where necessary to prevent irreparable harm pending arbitration.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Venue and Submission to Jurisdiction</h2>
            <p>
              For any matter not subject to arbitration, or for recognition or enforcement of an
              arbitral award, the parties irrevocably submit to the exclusive jurisdiction of the
              courts of the Province of Alberta, sitting in Calgary, Alberta. Each party waives any
              objection to the laying of venue of any proceeding in Calgary and any claim that any such
              court is an inconvenient or inappropriate forum.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. If we make material changes, we will notify
              you by email or by posting a notice on the Service at least 14 days before the changes
              take effect. Continued use of the Service after that date constitutes your acceptance of
              the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
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
