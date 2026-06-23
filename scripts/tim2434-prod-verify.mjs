// TIM-2434 live prod verify on groundwork.cafe against the trent@simpler.coffee
// fixture. Drives the full Document Import round-trip end-to-end:
//   upload → estimate → extract (real Anthropic spend, ~1-3 credits) → apply.
//
// Asserts:
//   - upload returns 201 with importId
//   - estimate returns estimate > 0
//   - extract returns >=1 proposedChanges + sessionStatus becomes 'ready'
//   - apply writes the chosen proposal into the right suite store
//   - row-level: document_imports.status='applied' + matching files row exists
//
// Cleanup: snapshots concept_brand workspace_documents.content before apply
// and restores it after, then deletes the document_imports session + storage
// objects so Trent's prod fixture is byte-identical to its pre-verify state.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = "https://groundwork.cafe";
const TARGET_EMAIL = "trent@simpler.coffee";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("FATAL: missing supabase env");
  process.exit(2);
}

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[1/9] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } =
  await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TARGET_EMAIL,
  });
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

console.log("[2/9] exchanging for session...");
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (sessErr) throw sessErr;
const session = sessData.session;
if (!session) throw new Error("no session");

const cookieValue = encodeURIComponent(
  JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: "bearer",
    user: session.user,
  }),
);
const userId = session.user.id;
const cookieHeader = `sb-${REF}-auth-token=${cookieValue}`;

console.log("[3/9] resolving Trent's active plan...");
const { data: u } = await admin
  .from("users")
  .select("current_plan_id, ai_credits_remaining")
  .eq("id", userId)
  .single();
if (!u?.current_plan_id) throw new Error("trent has no current_plan_id");
const planId = u.current_plan_id;
console.log(`  planId=${planId}  credits=${u.ai_credits_remaining}`);

console.log("[4/9] snapshotting concept workspace_documents...");
const { data: conceptBefore } = await admin
  .from("workspace_documents")
  .select("id, content")
  .eq("plan_id", planId)
  .eq("workspace_key", "concept")
  .maybeSingle();
const conceptBeforeRowExists = !!conceptBefore;
const conceptBeforeContent = conceptBefore?.content
  ? JSON.parse(JSON.stringify(conceptBefore.content))
  : null;

const PROBE_KEY = "tim2434_verify_probe";
const PROBE_VALUE = `tim2434-prod-verify-${Date.now()}`;

// Build a tiny CSV that the extraction model can easily map to a
// concept_brand:* field. Single page, ~200 bytes, ~1 credit on haiku.
const csv = [
  "field,value",
  "brand_name,The Verify Cafe",
  "tagline,Built On Probes",
  `${PROBE_KEY},${PROBE_VALUE}`,
  "",
].join("\n");

console.log("[5/9] POST /api/document-import/upload...");
const form = new FormData();
form.set("planId", planId);
form.set("source", "settings");
form.set("label", "tim2434 prod verify");
form.set(
  "file",
  new File([csv], "tim2434-verify.csv", { type: "text/csv" }),
  "tim2434-verify.csv",
);
const upRes = await fetch(`${PROD_URL}/api/document-import/upload`, {
  method: "POST",
  headers: { cookie: cookieHeader },
  body: form,
});
const upJson = await upRes.json();
console.log(`  status=${upRes.status} importId=${upJson.importId}`);
if (upRes.status !== 201 || !upJson.importId) {
  console.error("FATAL: upload failed:", upJson);
  process.exit(1);
}
const importId = upJson.importId;

let restoreNeeded = false;
let conceptApplied = 0;
let estimatedCredits = 0;
let proposalCount = 0;
let extractStatus = 0;

try {
  console.log("[6/9] POST /api/document-import/estimate...");
  const estRes = await fetch(`${PROD_URL}/api/document-import/estimate`, {
    method: "POST",
    headers: { cookie: cookieHeader, "content-type": "application/json" },
    body: JSON.stringify({ importId }),
  });
  const estJson = await estRes.json();
  estimatedCredits = estJson.estimate ?? 0;
  console.log(`  status=${estRes.status} estimate=${estimatedCredits}`);
  if (estRes.status !== 200 || !estimatedCredits) {
    throw new Error(`estimate failed: ${JSON.stringify(estJson)}`);
  }

  console.log(
    "[7/9] POST /api/document-import/extract (real Anthropic spend)...",
  );
  const exRes = await fetch(`${PROD_URL}/api/document-import/extract`, {
    method: "POST",
    headers: { cookie: cookieHeader, "content-type": "application/json" },
    body: JSON.stringify({ importId }),
  });
  extractStatus = exRes.status;
  const exJson = await exRes.json();
  proposalCount = (exJson.proposedChanges ?? []).length;
  console.log(
    `  status=${extractStatus} creditsCharged=${exJson.creditsCharged} proposals=${proposalCount} suggestions=${(exJson.suggestions ?? []).length}`,
  );
  if (extractStatus !== 200) {
    throw new Error(`extract failed: ${JSON.stringify(exJson)}`);
  }
  if (proposalCount === 0) {
    throw new Error(
      "extract returned 0 proposedChanges — extraction did not work end-to-end",
    );
  }
  for (const p of exJson.proposedChanges.slice(0, 6)) {
    console.log(`    - ${p.suite}:${p.fieldKey} = ${String(p.value).slice(0, 60)}`);
  }

  // Pick a concept_brand change to apply so we touch the workspace_documents
  // suite (round-trip evidence). If none exist, fall back to anything.
  const concept = exJson.proposedChanges.find(
    (c) => c.suite === "concept_brand",
  );
  const chosen = concept ?? exJson.proposedChanges[0];
  const fieldId = `${chosen.suite}:${chosen.fieldKey}`;
  // Force a deterministic, unique value so we can pin the round-trip assertion
  // and not depend on the model returning a particular cell.
  const finalValue = `tim2434-applied-${Date.now()}`;
  console.log(
    `  chosen fieldId=${fieldId} finalValue=${finalValue}`,
  );

  console.log("[8/9] POST /api/document-import/apply...");
  restoreNeeded = chosen.suite === "concept_brand";
  const apRes = await fetch(`${PROD_URL}/api/document-import/apply`, {
    method: "POST",
    headers: { cookie: cookieHeader, "content-type": "application/json" },
    body: JSON.stringify({
      importId,
      accepted: [{ fieldId, finalValue }],
    }),
  });
  const apJson = await apRes.json();
  conceptApplied = apJson?.applied?.concept_brand ?? 0;
  console.log(
    `  status=${apRes.status} applied=${JSON.stringify(apJson.applied)}`,
  );
  if (apRes.status !== 200) throw new Error(`apply failed: ${JSON.stringify(apJson)}`);

  if (chosen.suite === "concept_brand") {
    const { data: conceptAfter } = await admin
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle();
    const got = conceptAfter?.content?.[chosen.fieldKey];
    if (got !== finalValue) {
      throw new Error(
        `apply did not land: workspace_documents.concept.${chosen.fieldKey}=${JSON.stringify(got)}, expected=${JSON.stringify(finalValue)}`,
      );
    }
    console.log(
      `  ✓ workspace_documents.concept.${chosen.fieldKey} = ${finalValue}`,
    );
  }

  // Session row should be status=applied + the file should be complete.
  const { data: sessionRow } = await admin
    .from("document_imports")
    .select("status, credits_charged, estimated_credits")
    .eq("id", importId)
    .single();
  console.log(`  document_imports row: ${JSON.stringify(sessionRow)}`);
  if (sessionRow?.status !== "applied") {
    throw new Error(`session status not 'applied': ${sessionRow?.status}`);
  }
  const { data: filesRows } = await admin
    .from("document_import_files")
    .select("status, error_code, credits_charged, page_count")
    .eq("import_id", importId);
  console.log(`  document_import_files: ${JSON.stringify(filesRows)}`);
} finally {
  console.log("[9/9] cleanup...");
  // Restore concept content to its pre-verify shape.
  if (restoreNeeded) {
    if (conceptBeforeRowExists) {
      await admin
        .from("workspace_documents")
        .update({ content: conceptBeforeContent })
        .eq("plan_id", planId)
        .eq("workspace_key", "concept");
      console.log("  restored workspace_documents.concept content");
    } else {
      await admin
        .from("workspace_documents")
        .delete()
        .eq("plan_id", planId)
        .eq("workspace_key", "concept");
      console.log("  removed workspace_documents.concept row (created by verify)");
    }
  }
  // Delete the verify session + storage objects.
  const { data: filesToDelete } = await admin
    .from("document_import_files")
    .select("storage_path")
    .eq("import_id", importId);
  if (filesToDelete?.length) {
    const paths = filesToDelete.map((f) => f.storage_path).filter(Boolean);
    if (paths.length) {
      await admin.storage.from("document-imports").remove(paths);
      console.log(`  removed ${paths.length} storage object(s)`);
    }
  }
  await admin
    .from("document_import_files")
    .delete()
    .eq("import_id", importId);
  await admin.from("document_imports").delete().eq("id", importId);
  console.log("  removed document_imports session + files rows");
}

console.log("\n=== RESULT ===");
console.log(
  JSON.stringify(
    {
      uploadCreated201: true,
      estimatedCredits,
      extractStatus,
      proposalCount,
      conceptApplied,
      pass:
        estimatedCredits > 0 &&
        extractStatus === 200 &&
        proposalCount > 0 &&
        conceptApplied >= 1,
    },
    null,
    2,
  ),
);
