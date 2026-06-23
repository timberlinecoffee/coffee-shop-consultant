// TIM-2949: live prod E2E verify for the menu-item photo upload pipeline.
// Drives trent@simpler.coffee against groundwork.cafe via the route's actual
// Supabase-cookie auth path. Server-side roundtrip — no browser dependency.
//
//   1. Mint magiclink → verifyOtp → sb-${REF}-auth-token cookie
//   2. Pick a trent menu_item, snapshot its photo_path
//   3. POST /api/workspaces/menu-pricing/items/{id}/photo with a tiny JPEG
//   4. GET .../photo/url → fetch the signed URL → assert image/jpeg + bytes
//   5. DELETE .../photo → assert photo_path NULL on read-back
//   6. Try/finally restore the original photo_path

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import sharp from "sharp"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=")
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    }),
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const PROD_URL = process.env.TARGET_URL ?? "https://groundwork.cafe"
const TARGET_EMAIL = "trent@simpler.coffee"
const REF = new URL(SUPABASE_URL).hostname.split(".")[0]

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── 1. Mint magiclink ───────────────────────────────────────────────────────
console.log(`[1] minting magiclink for ${TARGET_EMAIL}...`)
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
})
if (linkErr) throw linkErr
const tokenHash = linkData?.properties?.hashed_token
if (!tokenHash) throw new Error("no token_hash")

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
})
if (sessErr) throw sessErr
const session = sessData.session
const userId = session.user.id

const cookieValue = encodeURIComponent(
  JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: "bearer",
    user: session.user,
  }),
)
const cookieHeader = `sb-${REF}-auth-token=${cookieValue}`

// ── 2. Discover plan + pick a beverage menu_item ────────────────────────────
// Trent has multiple plans; pick whichever plan has menu items, and pin
// current_plan_id to it for the duration of the test so the route's
// getActivePlanId() resolves to the right plan. Restore at finally.
const { data: userRow } = await admin
  .from("users")
  .select("current_plan_id")
  .eq("id", userId)
  .single()
const originalCurrentPlanId = userRow?.current_plan_id
console.log(`[2a] current_plan_id (snapshot): ${originalCurrentPlanId}`)

const { data: candidateItems } = await admin
  .from("menu_items")
  .select("id, plan_id, name, photo_path")
  .eq("archived", false)
  .order("position")
const trentPlanIds = new Set(
  (
    await admin
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", userId)
  ).data?.map((p) => p.id) ?? [],
)
const trentItems = candidateItems?.filter((i) => trentPlanIds.has(i.plan_id)) ?? []
if (!trentItems.length) throw new Error("no menu items across any of trent's plans")
const target = trentItems[0]
const beforePhotoPath = target.photo_path
const planId = target.plan_id
console.log(`[2b] target plan with items: ${planId}, n=${trentItems.length}`)
if (planId !== originalCurrentPlanId) {
  await admin.from("users").update({ current_plan_id: planId }).eq("id", userId)
  console.log(`[2c] flipped current_plan_id ${originalCurrentPlanId} → ${planId}`)
}
console.log(
  `[3] target item: "${target.name}" id=${target.id} beforePhotoPath=${JSON.stringify(beforePhotoPath)}`,
)

// ── 3. Build a tiny 4:5 test JPEG with sharp ────────────────────────────────
const probeBuf = await sharp({
  create: {
    width: 800,
    height: 1000,
    channels: 3,
    background: { r: 21, g: 94, b: 99 }, // groundwork teal — distinctive
  },
})
  .jpeg({ quality: 90 })
  .toBuffer()
console.log(`[4] test JPEG: ${probeBuf.length} bytes`)

const result = { steps: [] }
const note = (k, v) => { console.log(`    ${k}: ${JSON.stringify(v)}`); result.steps.push({ [k]: v }) }

try {
  // ── 4. POST upload ────────────────────────────────────────────────────────
  console.log(`[5] POST /api/workspaces/menu-pricing/items/${target.id}/photo ...`)
  const form = new FormData()
  form.append("file", new File([probeBuf], "probe.jpg", { type: "image/jpeg" }))
  const postRes = await fetch(`${PROD_URL}/api/workspaces/menu-pricing/items/${target.id}/photo`, {
    method: "POST",
    headers: { cookie: cookieHeader },
    body: form,
  })
  note("postStatus", postRes.status)
  const postJson = await postRes.json()
  note("postBody", postJson)
  if (!postRes.ok) throw new Error(`upload failed: ${JSON.stringify(postJson)}`)
  if (!postJson.photo_path) throw new Error("response missing photo_path")
  if (!postJson.signedUrl) throw new Error("response missing signedUrl")

  // ── 5. DB read-back ──────────────────────────────────────────────────────
  const { data: afterUpload } = await admin
    .from("menu_items")
    .select("photo_path")
    .eq("id", target.id)
    .single()
  note("dbPhotoPathAfterUpload", afterUpload?.photo_path)
  if (afterUpload?.photo_path !== postJson.photo_path) {
    throw new Error(
      `DB drift: db=${afterUpload?.photo_path} resp=${postJson.photo_path}`,
    )
  }

  // ── 6. Fetch the signed URL → assert image bytes ──────────────────────────
  console.log(`[6] fetching signedUrl ...`)
  const imgRes = await fetch(postJson.signedUrl)
  note("signedUrlStatus", imgRes.status)
  const imgType = imgRes.headers.get("content-type") ?? ""
  note("signedUrlContentType", imgType)
  const imgBuf = Buffer.from(await imgRes.arrayBuffer())
  note("signedUrlBytes", imgBuf.length)
  if (imgRes.status !== 200) throw new Error("signed URL returned non-200")
  if (!imgType.startsWith("image/")) throw new Error(`unexpected content-type: ${imgType}`)
  // JPEG magic header is FF D8 FF
  if (!(imgBuf[0] === 0xff && imgBuf[1] === 0xd8 && imgBuf[2] === 0xff)) {
    throw new Error(`not a JPEG — magic header: ${imgBuf.subarray(0, 4).toString("hex")}`)
  }

  // ── 7. GET /photo/url → fresh signed URL works too ────────────────────────
  console.log(`[7] GET .../photo/url ...`)
  const urlRes = await fetch(`${PROD_URL}/api/workspaces/menu-pricing/items/${target.id}/photo/url`, {
    headers: { cookie: cookieHeader },
  })
  note("urlEndpointStatus", urlRes.status)
  const urlJson = await urlRes.json()
  note("urlEndpointBody", { hasSignedUrl: !!urlJson.signedUrl })
  if (!urlRes.ok || !urlJson.signedUrl) {
    throw new Error("url endpoint did not return a signed URL")
  }

  // ── 8. DELETE photo ───────────────────────────────────────────────────────
  console.log(`[8] DELETE .../photo ...`)
  const delRes = await fetch(`${PROD_URL}/api/workspaces/menu-pricing/items/${target.id}/photo`, {
    method: "DELETE",
    headers: { cookie: cookieHeader },
  })
  note("deleteStatus", delRes.status)
  if (!delRes.ok) throw new Error("delete failed")

  const { data: afterDelete } = await admin
    .from("menu_items")
    .select("photo_path")
    .eq("id", target.id)
    .single()
  note("dbPhotoPathAfterDelete", afterDelete?.photo_path)
  if (afterDelete?.photo_path !== null) {
    throw new Error("DB photo_path should be NULL after DELETE")
  }

  // ── 9. Auth gate — unauthed call should 401 ───────────────────────────────
  const unauthRes = await fetch(`${PROD_URL}/api/workspaces/menu-pricing/items/${target.id}/photo/url`)
  note("unauthStatus", unauthRes.status)
  if (unauthRes.status !== 401) throw new Error(`expected 401 unauthed, got ${unauthRes.status}`)

  result.ok = true
  console.log("\n=== SUCCESS — TIM-2949 prod E2E PASS ===")
} catch (err) {
  result.ok = false
  result.error = err.message
  console.error("FAILED:", err.message)
} finally {
  // ── 10. Restore fixture state ─────────────────────────────────────────────
  try {
    await admin
      .from("menu_items")
      .update({ photo_path: beforePhotoPath })
      .eq("id", target.id)
    console.log(`[10a] restored photo_path = ${JSON.stringify(beforePhotoPath)}`)
  } catch (e) {
    console.error("photo_path restore failed — manual:", e.message)
    console.error(`  UPDATE menu_items SET photo_path = ${JSON.stringify(beforePhotoPath)} WHERE id = '${target.id}';`)
  }
  try {
    if (planId !== originalCurrentPlanId) {
      await admin.from("users").update({ current_plan_id: originalCurrentPlanId }).eq("id", userId)
      console.log(`[10b] restored current_plan_id = ${originalCurrentPlanId}`)
    }
  } catch (e) {
    console.error("current_plan_id restore failed — manual:", e.message)
    console.error(`  UPDATE users SET current_plan_id = '${originalCurrentPlanId}' WHERE id = '${userId}';`)
  }
}

console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exit(1)
