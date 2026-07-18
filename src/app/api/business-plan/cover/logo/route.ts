// TIM-1225: Business Plan logo upload (POST multipart) and remove (DELETE).
// Accepts PNG, JPEG, WebP, SVG — converts WebP/SVG to PNG before storing,
// per CTO sign-off addendum (TIM-1224 spec).

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import sharp from "sharp";

const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

async function getAuthedPlan(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, plan: null };

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { user, plan };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { user, plan } = await getAuthedPlan(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ACCEPTED_MIME.has(file.type)) {
    return Response.json({ error: "Unsupported format — use PNG, JPEG, or SVG" }, { status: 422 });
  }

  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large — max 2 MB" }, { status: 422 });
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // Convert WebP or SVG to PNG for react-pdf compatibility (CTO addendum, TIM-1224).
  let finalBuffer: Buffer;
  let finalMime = "image/png";
  let ext = "png";

  try {
    if (file.type === "image/svg+xml" || file.type === "image/webp") {
      // Rasterize at 2x the largest editorial display box: 200×96pt → 400×192px.
      // Preserves alpha channel for PNG output (required for editorial dark background).
      finalBuffer = await sharp(rawBuffer)
        .resize({ width: 400, height: 192, fit: "inside", withoutEnlargement: false })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } else if (file.type === "image/jpeg" || file.type === "image/jpg") {
      finalBuffer = rawBuffer;
      finalMime = "image/jpeg";
      ext = "jpg";
    } else {
      // PNG
      finalBuffer = rawBuffer;
    }
  } catch {
    return Response.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  // Remove existing logo first (best-effort).
  const { data: existingCover } = await supabase
    .from("business_plan_cover")
    .select("logo_path")
    .eq("plan_id", plan.id)
    .maybeSingle();

  if (existingCover?.logo_path) {
    await supabase.storage.from("business-plan-logos").remove([existingCover.logo_path]);
  }

  const storagePath = `${plan.id}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("business-plan-logos")
    .upload(storagePath, finalBuffer, {
      contentType: finalMime,
      upsert: true,
    });

  if (uploadError) {
    return Response.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  const { error: dbError } = await supabase
    .from("business_plan_cover")
    .upsert({ plan_id: plan.id, logo_path: storagePath }, { onConflict: "plan_id" });

  if (dbError) {
    console.error("[business-plan/cover/logo] DB error:", dbError);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return Response.json({ logo_path: storagePath });
}

export async function DELETE() {
  const supabase = await createClient();
  const { user, plan } = await getAuthedPlan(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!plan) return Response.json({ error: "No plan" }, { status: 404 });

  const { data: cover } = await supabase
    .from("business_plan_cover")
    .select("logo_path")
    .eq("plan_id", plan.id)
    .maybeSingle();

  if (cover?.logo_path) {
    await supabase.storage.from("business-plan-logos").remove([cover.logo_path]);
  }

  const { error } = await supabase
    .from("business_plan_cover")
    .upsert({ plan_id: plan.id, logo_path: null }, { onConflict: "plan_id" });

  if (error) { console.error("[route] DB error:", error); return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 }); }

  return Response.json({ ok: true });
}
