import Link from "next/link";

export const metadata = {
  title: "Subscription Terms | Timberline Coffee School",
  description: "Subscription Terms for Timberline Coffee School covering billing, renewal, and cancellation.",
};

const EFFECTIVE_DATE = "May 22, 2026";

export default function SubscriptionTermsPage() {
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
        <h1 className="text-3xl font-bold text-neutral-950 mb-2">Subscription Terms</h1>
        <p className="text-sm text-neutral-500 mb-10">Effective {EFFECTIVE_DATE}</p>

        <div className="prose prose-sm max-w-none text-neutral-950 space-y-8">
          <p>
            These Subscription Terms supplement the Timberline Coffee School{" "}
            <Link href="/terms" className="text-teal underline">
              Terms of Service
            </Link>{" "}
            and govern the billing, renewal, and cancellation of your paid subscription. By starting a
            subscription, you agree to these terms.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Subscription Plans</h2>
            <p>
              Timberline offers monthly and annual subscription plans. Current pricing is listed at{" "}
              <Link href="/pricing" className="text-teal underline">
                timberlinecoffeeschool.com/pricing
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
            <h2 className="text-xl font-semibold mb-3">3. Free Trials</h2>
            <p>
              If you start a free trial, you will not be charged until the trial ends. You may cancel
              during the trial period without charge. If you do not cancel before the trial ends, your
              subscription will begin and you will be billed at the applicable rate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Cancellation</h2>
            <p>
              You may cancel your subscription at any time from your account settings or by contacting{" "}
              <a href="mailto:support@timberlinecoffeeschool.com" className="text-teal underline">
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
              <a href="mailto:support@timberlinecoffeeschool.com" className="text-teal underline">
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
              <a href="mailto:billing@timberlinecoffeeschool.com" className="text-teal underline">
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
              Timberline Coffee School
              <br />
              Email:{" "}
              <a href="mailto:billing@timberlinecoffeeschool.com" className="text-teal underline">
                billing@timberlinecoffeeschool.com
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
