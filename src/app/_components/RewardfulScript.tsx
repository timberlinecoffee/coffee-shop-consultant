import Script from "next/script";

/**
 * Rewardful affiliate tracking script (TIM-1620).
 *
 * Renders no visible UI — it only installs the Rewardful tracking snippet so the
 * `?via=<affiliate>` referral param is captured into a 60-day last-click cookie and
 * exposed as `window.Rewardful.referral`. The pricing checkout then forwards that id
 * to Stripe as `client_reference_id` (see `api/stripe/create-checkout-session`).
 *
 * Env-gated: with `NEXT_PUBLIC_REWARDFUL_API_KEY` unset (pre-provisioning) this is a
 * no-op and emits nothing. Set the key once the Rewardful account is connected to
 * Stripe to activate tracking. The key is a public client-side tracking id, not a secret.
 *
 * Both tags use `beforeInteractive` so the queue stub is defined before `rw.js` loads
 * and the referral is resolved before any page reads it. Next requires
 * `beforeInteractive` scripts to live in the root layout, which is where this renders.
 */
export function RewardfulScript() {
  const apiKey = process.env.NEXT_PUBLIC_REWARDFUL_API_KEY;
  if (!apiKey) return null;

  return (
    <>
      <Script id="rewardful-queue" strategy="beforeInteractive">
        {`(function(w,r){w._rwq=r;w[r]=w[r]||function(){(w[r].q=w[r].q||[]).push(arguments)}})(window,'rewardful');`}
      </Script>
      <Script
        id="rewardful-js"
        src="https://r.wdfl.co/rw.js"
        data-rewardful={apiKey}
        strategy="beforeInteractive"
      />
    </>
  );
}
