import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Timberline Coffee School",
  description: "Privacy Policy for Timberline Coffee School.",
};

const EFFECTIVE_DATE = "May 22, 2026";

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#afafaf] mb-10">Effective {EFFECTIVE_DATE}</p>

        <div className="prose prose-sm max-w-none text-[#1a1a1a] space-y-8">
          <p>
            Timberline Coffee School (&quot;Timberline&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed
            to protecting your privacy. This Privacy Policy explains what information we collect, how we
            use it, and your rights regarding that information.
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
              <li>Detect and prevent fraud and abuse.</li>
              <li>Comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Information We Share</h2>
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
                <strong>Legal and safety.</strong> We may disclose information if required by law,
                court order, or to protect the rights and safety of Timberline, our users, or the
                public.
              </li>
              <li>
                <strong>Business transfers.</strong> If Timberline is acquired or merges with another
                company, your information may be transferred as part of that transaction. We will notify
                you in advance.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data Retention</h2>
            <p>
              We retain your account information for as long as your account is active, plus up to 3
              years after closure for legal and audit purposes. Payment records are retained as required
              by law (typically 7 years). You may request deletion at any time (see Your Rights below).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Your Rights</h2>
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
              <a href="mailto:privacy@timberlinecoffeeschool.com" className="text-[#155e63] underline">
                privacy@timberlinecoffeeschool.com
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Cookies</h2>
            <p>
              We use cookies and similar technologies to keep you logged in, remember your preferences,
              and analyze traffic. You can control cookies through your browser settings. Disabling
              cookies may affect some Service features.
            </p>
            <p className="mt-3">
              We do not use third-party advertising cookies or tracking pixels for ad targeting.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Security</h2>
            <p>
              We use industry-standard security measures including encryption in transit (TLS) and at
              rest, access controls, and regular security reviews. No method of transmission over the
              internet is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Children</h2>
            <p>
              The Service is not directed to children under 13. We do not knowingly collect personal
              information from children under 13. If you believe we have collected such information,
              please contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes, we will
              notify you by email at least 14 days before the changes take effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
            <p>
              Timberline Coffee School
              <br />
              Email:{" "}
              <a href="mailto:privacy@timberlinecoffeeschool.com" className="text-[#155e63] underline">
                privacy@timberlinecoffeeschool.com
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="bg-[#1a1a1a] text-[#afafaf] px-6 py-6 text-sm">
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
