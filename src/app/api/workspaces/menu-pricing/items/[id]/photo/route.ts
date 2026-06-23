// TIM-2949: User-uploaded 4:5 menu item photo.
// POST multipart -> sharp center-crop to 1000x1250 JPEG -> menu-item-photos bucket
// DELETE -> remove file + null column.
// Standing Rules (TIM-2252): server-side authz (item belongs to user's plan),
// validate MIME + size, graceful sanitized errors.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import type { NextRequest } from "next/server";
import sharp from "sharp";

const ACCEPTED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const TARGET_WIDTH = 1000;
const TARGET_HEIGHT = 1250; // 4:5

async function loadOwnedItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string,
) {
  const planId = await getActivePlanId(supabase, userId);
  if (!planId) return { planId: null, item: null };
  const { data: item } = await supabase
    .from("menu_items")
    .select("id, plan_id, photo_path")
    .eq("id", itemId)
    .eq("plan_id", planId)
    .maybeSingle();
  return { planId, item };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { item } = await loadOwnedItem(supabase, user.id, id);
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });

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
    return Response.json(
      { error: "Unsupported format — use JPEG, PNG, or WebP" },
      { status: 422 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large — max 5 MB" }, { status: 422 });
  }

  let croppedBuffer: Buffer;
  try {
    const raw = Buffer.from(await file.arrayBuffer());
    croppedBuffer = await sharp(raw)
      .rotate() // honor EXIF orientation
      .resize({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        fit: "cover",
        position: "attention",
      })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch {
    return Response.json({ error: "Could not process image" }, { status: 422 });
  }

  // Remove any prior photo first (best-effort).
  if (item.photo_path) {
    await supabase.storage.from("menu-item-photos").remove([item.photo_path]);
  }

  const storagePath = `${item.plan_id}/${item.id}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("menu-item-photos")
    .upload(storagePath, croppedBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) {
    return Response.json({ error: "Upload failed. Try again." }, { status: 500 });
  }

  const { error: dbError } = await supabase
    .from("menu_items")
    .update({ photo_path: storagePath })
    .eq("id", item.id)
    .eq("plan_id", item.plan_id);
  if (dbError) {
    return Response.json({ error: "Could not save photo" }, { status: 500 });
  }

  const { data: signed } = await supabase.storage
    .from("menu-item-photos")
    .createSignedUrl(storagePath, 60 * 60);

  return Response.json({ photo_path: storagePath, signedUrl: signed?.signedUrl ?? null });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { item } = await loadOwnedItem(supabase, user.id, id);
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });

  if (item.photo_path) {
    await supabase.storage.from("menu-item-photos").remove([item.photo_path]);
  }

  const { error } = await supabase
    .from("menu_items")
    .update({ photo_path: null })
    .eq("id", item.id)
    .eq("plan_id", item.plan_id);
  if (error) return Response.json({ error: "Could not remove photo" }, { status: 500 });

  return Response.json({ ok: true });
}
