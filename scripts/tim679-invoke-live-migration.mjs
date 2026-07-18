// TIM-679: post-merge invoker for src/app/api/admin/tim679-stripe-live-migrate/route.ts.
//
// Steps:
//   1. Dry-run first, print plan.
//   2. Live run, capture 4 price IDs.
//   3. Print PATCH-Vercel-env commands the operator can paste.
//
// Auth: Bearer SUPABASE_SERVICE_ROLE_KEY. Both VPS `.env` and Vercel Prod env
// hold the same key; the route's constant-time compare guarantees only the
// holder of that plaintext can invoke.
//
// Env required:
//   SUPABASE_SERVICE_ROLE_KEY   (from Vercel Prod env pull or VPS)
//   PROD_URL                     (default: https://coffee-shop-consultant.vercel.app)

const PROD = process.env.PROD_URL || "https://coffee-shop-consultant.vercel.app";
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SVC) {
  console.error("SUPABASE_SERVICE_ROLE_KEY env var required");
  process.exit(2);
}

async function invoke(dryRun) {
  const res = await fetch(`${PROD}/api/admin/tim679-stripe-live-migrate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SVC}`,
    },
    body: JSON.stringify({ dryRun }),
  });
  const bodyText = await res.text();
  let body;
  try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText.slice(0, 500) }; }
  return { status: res.status, body };
}

(async () => {
  console.log("=== TIM-679 dry-run ===");
  const dry = await invoke(true);
  console.log(`  HTTP ${dry.status}`);
  console.log(JSON.stringify(dry.body, null, 2));
  if (dry.status !== 200) process.exit(1);
  if (dry.body.keyMode !== "live") {
    console.error(`WARN: runtime STRIPE_SECRET_KEY is "${dry.body.keyMode}" mode, expected "live". Aborting live run.`);
    process.exit(1);
  }

  console.log("\n=== TIM-679 live run ===");
  const live = await invoke(false);
  console.log(`  HTTP ${live.status}`);
  console.log(JSON.stringify(live.body, null, 2));
  if (live.status !== 200) process.exit(1);

  console.log("\n=== Vercel env sync commands (paste into shell) ===");
  for (const [key, value] of Object.entries(live.body.envVarsToSet || {})) {
    console.log(`vercel env rm ${key} production --yes 2>/dev/null; echo "${value}" | vercel env add ${key} production`);
  }
  console.log("\n(After running the vercel env commands above, push a trivial commit to `main` to trigger the Vercel prod redeploy — see AGENTS.md `Vercel prod deploys come from main only` for the reason we don't invoke a prod-target flag directly.)");
})();
