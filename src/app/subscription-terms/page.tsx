import Link from "next/link";
import { Logo } from "../_components/Logo";
import { CookiePreferencesLink } from "@/components/consent/CookiePreferencesLink";

export const metadata = {
  title: "Subscription Terms | Groundwork",
  description: "Subscription Terms for Groundwork covering billing, renewal, and cancellation.",
};

const EFFECTIVE_DATE = "May 22, 2026";

export default function SubscriptionTermsPage() {
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
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Subscription Terms</h1>
        <p className="text-sm text-[var(--dark-grey)] mb-10">Effective {EFFECTIVE_DATE}</p>

        <div className="prose prose-sm max-w-none text-[var(--foreground)] space-y-8">
          <p>
            These Subscription Terms supplement the Groundwork{" "}
            <Link href="/terms" className="text-[var(--teal)] underline">
              Terms of Service
            </Link>{" "}
            and govern the billing, renewal, and cancellation of your paid subscription. By starting a
            subscription, you agree to these terms. Groundwork is a product of Timberline Coffee School.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Subscription Plans</h2>
            <p>
              Groundwork offers monthly and annual subscription plans. Current pricing is listed at{" "}
              <Link href="/pricing" className="text-[var(--teal)] underline">
                groundwork.coffee/pricing
              </Link>
              . We may add or change plans at any time; existing subscribers will be notified before
              price changes take effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Billing and Auto-Renewal</h2>
            <p>
              Subscriptions renew automatically at the end of each billing cycle (monthly or annual)
              unless you cancel before the renewal date.
            </p>
            <p className="mt-3">
              For monthly plans, billing occurs on the same date each month. For annual plans, billing
              occurs on the same date each year.
            </p>
            <p className="mt-3">
              You authorize us to charge the payment method on file for the recurring subscription fee.
              All charges are processed by Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Free Preview</h2>
            <p>
              New accounts receive a free preview of the planning framework, including 5 free AI
              planning messages with Scout. The free preview does not require a credit card
              and does not auto-convert to a paid subscription.
            </p>
            <p className="mt-3">
              Continued access to AI planning messages beyond the preview, and to the full set of
              paid planning modules, requires you to start a paid subscription by entering payment
              details at{" "}
              <Link href="/pricing" className="text-[var(--teal)] underline">
                groundwork.coffee/pricing
              </Link>
              . Your account will not be charged unless and until you explicitly start a paid
              subscription.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Cancellation</h2>
            <p>
              You may cancel your subscription at any time from your account settings or by contacting{" "}
              <a href="mailto:support@timberlinecoffeeschool.com" className="text-[var(--teal)] underline">
                support@timberlinecoffeeschool.com
              </a>
              .
            </p>
            <p className="mt-3">
              Cancellation takes effect at the end of the current billing period. You will retain access
              to the Service until that date. We do not issue prorated refunds for partial billing
              periods upon cancellation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Refund Policy</h2>
            <p>
              We offer a 7-day money-back guarantee on your first subscription payment only. If you are
              unsatisfied within the first 7 days of a new paid subscription, contact{" "}
              <a href="mailto:support@timberlinecoffeeschool.com" className="text-[var(--teal)] underline">
                support@timberlinecoffeeschool.com
              </a>{" "}
              for a full refund.
            </p>
            <p className="mt-3">
              After 7 days, payments are non-refundable except where required by law.
            </p>
            <p className="mt-3">
              Annual subscriptions are refundable within 7 days of each annual renewal charge under the
              same conditions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Plan Changes</h2>
            <p>
              <strong>Upgrading.</strong> If you upgrade to a higher plan mid-cycle, we will charge a
              prorated amount for the remainder of the current billing period and place you on the new
              plan immediately.
            </p>
            <p className="mt-3">
              <strong>Downgrading.</strong> If you downgrade to a lower plan, the change takes effect
              at the start of your next billing cycle. You will retain your current plan&rsquo;s
              features until then.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Failed Payments</h2>
            <p>
              If a payment fails, we will retry the charge up to 3 times over 7 days. We will notify
              you by email if payment cannot be processed.
            </p>
            <p className="mt-3">
              If payment remains outstanding after all retries, your account will be downgraded to a
              free tier (if available) or suspended. Suspended accounts may be reactivated by updating
              your payment method and settling any outstanding balance. Data is retained for 30 days
              after suspension before deletion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Taxes</h2>
            <p>
              Prices displayed may not include applicable sales tax, VAT, or other taxes. Any applicable
              taxes will be calculated and added at checkout based on your billing address. You are
              responsible for any taxes owed in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Disputes</h2>
            <p>
              If you believe a charge is incorrect, contact{" "}
              <a href="mailto:billing@timberlinecoffeeschool.com" className="text-[var(--teal)] underline">
                billing@timberlinecoffeeschool.com
              </a>{" "}
              within 60 days of the charge date. We will investigate and respond within 10 business
              days. Filing a chargeback before contacting us may result in account suspension.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Changes to These Terms</h2>
            <p>
              We may update these Subscription Terms from time to time. Material changes will be
              communicated by email at least 14 days before they take effect. Continued use of your
              subscription after that date constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Contact</h2>
            <p>
              Groundwork, a product of Timberline Coffee School
              <br />
              Email:{" "}
              <a href="mailto:billing@timberlinecoffeeschool.com" className="text-[var(--teal)] underline">
                billing@timberlinecoffeeschool.com
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="bg-[var(--foreground)] text-[var(--dark-grey)] px-6 py-6 text-sm">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <span>&copy; {new Date().getFullYear()} Timberline Coffee School. Groundwork is a product of Timberline Coffee School.</span>
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
