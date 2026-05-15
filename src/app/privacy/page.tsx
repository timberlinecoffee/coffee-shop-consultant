import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — My Coffee Shop Consultant",
  description: "Privacy Policy for Timberline Coffee School and My Coffee Shop Consultant.",
};

const EFFECTIVE_DATE = "May 15, 2026";

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
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Overview</h2>
            <p>
              This Privacy Policy explains how Timberline Coffee School (&quot;Timberline,&quot;
              &quot;we,&quot; &quot;us&quot;) collects, uses, shares, and protects personal
              information in connection with the My Coffee Shop Consultant platform
              (the &quot;Service&quot;). It applies to visitors, free users, and paid
              subscribers. By using the Service you agree to this Policy and to our{" "}
              <Link href="/terms" className="text-[#155e63] underline">
                Terms of Service
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Information we collect</h2>
            <p>We collect the following categories of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account information.</strong> Email address, password (stored
                hashed), authentication identifiers from Google when you sign in with
                Google, and your display name if provided.
              </li>
              <li>
                <strong>Profile and onboarding data.</strong> Information you provide
                during the onboarding wizard and in module exercises, including your
                concept, target customer, location preferences, financial inputs, and
                business goals.
              </li>
              <li>
                <strong>Usage and AI conversation data.</strong> Pages you visit, modules
                and sections you complete, prompts you send to the AI coach, AI responses
                returned to you, credit consumption, and timestamps.
              </li>
              <li>
                <strong>Subscription and billing data.</strong> Your subscription tier,
                billing interval, plan status, and Stripe customer / subscription
                identifiers. Card numbers and bank details are collected and stored by
                Stripe, not by Timberline.
              </li>
              <li>
                <strong>Device and log data.</strong> IP address, browser type, device
                type, referring URL, and similar information collected automatically when
                you use the Service.
              </li>
              <li>
                <strong>Cookies and similar technologies.</strong> Essential cookies for
                login session management and limited analytics cookies as described in
                Section 6.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How we use information</h2>
            <p>We use personal information to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide, operate, and improve the Service;</li>
              <li>
                Personalize your dashboard, modules, and AI coaching to your business
                context;
              </li>
              <li>Process payments, manage subscriptions, and prevent fraud;</li>
              <li>
                Send transactional messages (account confirmations, billing receipts,
                security alerts, important Service announcements);
              </li>
              <li>Provide customer support and respond to your requests;</li>
              <li>
                Monitor performance, debug issues, and protect the security and integrity
                of the Service;
              </li>
              <li>Comply with legal obligations.</li>
            </ul>
            <p>
              We will not sell your personal information. We do not use the contents of
              Your Content (including AI prompts and responses) to train third-party AI
              models.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Legal bases (EEA / UK users)</h2>
            <p>
              If you are in the European Economic Area or United Kingdom, our legal bases
              for processing are: (a) performance of our contract with you; (b) our
              legitimate interests in operating, securing, and improving the Service; (c)
              your consent, where required (for example, for non-essential cookies); and
              (d) compliance with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. How we share information</h2>
            <p>We share personal information only as needed:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Service providers (subprocessors).</strong> We use trusted vendors
                to operate the Service, including:
                <ul className="list-disc pl-6 mt-1 space-y-1">
                  <li>
                    <strong>Supabase</strong> &mdash; database, authentication, and
                    storage hosting (United States).
                  </li>
                  <li>
                    <strong>Vercel</strong> &mdash; application hosting and analytics
                    (United States).
                  </li>
                  <li>
                    <strong>Stripe</strong> &mdash; subscription billing and payment
                    processing.
                  </li>
                  <li>
                    <strong>Anthropic</strong> &mdash; AI coaching responses; prompts and
                    responses are sent to Anthropic to generate AI Output.
                  </li>
                  <li>
                    <strong>Google</strong> &mdash; Google sign-in (only if you choose to
                    sign in with Google).
                  </li>
                </ul>
                These providers process information only as instructed by us and under
                their own privacy commitments.
              </li>
              <li>
                <strong>Legal and safety.</strong> We may disclose information when
                required by law, subpoena, or other legal process, or when we believe in
                good faith that disclosure is necessary to protect our rights, your
                safety, or the safety of others, or to investigate fraud or violations of
                our Terms.
              </li>
              <li>
                <strong>Business transfers.</strong> If Timberline is involved in a
                merger, acquisition, financing, or sale of assets, your information may be
                transferred as part of that transaction; we will notify you of any change
                in ownership or use of your personal information.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Cookies and analytics</h2>
            <p>
              We use a small number of cookies that are strictly necessary to keep you
              signed in and to remember your session. We use limited, privacy-respecting
              analytics (such as page-view counts via Vercel Analytics) to understand how
              the Service is used in aggregate. We do not run advertising trackers or
              cross-site profiling.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Data retention</h2>
            <p>
              We keep your account information and Your Content for as long as your
              account is active. If you cancel your subscription, your account remains
              accessible to you on the free tier; we keep your data so you can return to
              it. If you delete your account, we will delete your account profile, plan
              data, module responses, and AI conversation history within 30 days, except
              where we are required to retain limited records (for example, billing and
              tax records, fraud-prevention logs, or as required by law) for up to 7
              years.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Your rights</h2>
            <p>
              Subject to applicable law (including the EU/UK GDPR and the California
              Consumer Privacy Act), you have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal information we hold about you;</li>
              <li>Request correction of inaccurate information;</li>
              <li>Request deletion of your account and associated personal information;</li>
              <li>Request a portable copy of your account data;</li>
              <li>Object to or restrict certain processing;</li>
              <li>Withdraw consent where we rely on it;</li>
              <li>
                If you are a California resident, opt out of any &quot;sale&quot; or
                &quot;sharing&quot; of personal information (we do not sell or share
                personal information for cross-context behavioral advertising) and not be
                discriminated against for exercising your rights.
              </li>
            </ul>
            <p>
              To exercise any of these rights, email{" "}
              <a href="mailto:hello@timberline.coffee" className="text-[#155e63] underline">
                hello@timberline.coffee
              </a>
              . We may need to verify your identity before responding. You also have the
              right to lodge a complaint with your local data-protection authority.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. International transfers</h2>
            <p>
              Timberline is based in the United States, and our subprocessors primarily
              host data in the United States. If you access the Service from outside the
              United States, your information will be transferred to and processed in the
              United States. We rely on appropriate safeguards (such as Standard
              Contractual Clauses) for transfers from the EEA, UK, and Switzerland where
              required.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Security</h2>
            <p>
              We use industry-standard administrative, technical, and physical safeguards
              to protect personal information, including encryption in transit, encryption
              at rest for our database, row-level security, and least-privilege access for
              staff. No system is perfectly secure; if we learn of a security incident
              affecting your personal information we will notify you as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Children</h2>
            <p>
              The Service is not directed to children under 16, and we do not knowingly
              collect personal information from children under 16. If you believe we have
              collected information from a child under 16, please contact us and we will
              delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Changes to this Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material
              changes, we will notify you by email or through the Service before they take
              effect. The &quot;Effective&quot; date at the top of this page indicates
              when it was last updated.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Contact</h2>
            <p>
              Questions or requests about this Privacy Policy? Email{" "}
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
