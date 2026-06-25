"use client";

// TIM-2949: 4:5 photo upload control on the canonical menu card editor (TIM-2923).
// Replaces the curated illustration block. Server crops to 4:5 with sharp; this
// component shows a blob preview while the upload is in flight, then swaps to
// the server-issued signed URL. JPEG/PNG/WebP, ≤5 MB.

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";

type Props = {
  itemId: string;
  photoPath: string | null;
  canEdit: boolean;
  onPhotoChange: (path: string | null) => void;
};

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export function ItemPhotoUpload({ itemId, photoPath, canEdit, onPhotoChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Keep the signed URL keyed to the path it was fetched for. A stale path
  // (parent removed photo) renders as no-photo without a sync setState in the
  // effect — sidesteps react-hooks/set-state-in-effect.
  const [signedForPath, setSignedForPath] = useState<{ path: string | null; url: string | null }>({
    path: null,
    url: null,
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "removing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photoPath) return;
    let cancelled = false;
    fetch(`/api/workspaces/menu-pricing/items/${itemId}/photo/url`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        setSignedForPath({ path: photoPath, url: (j?.signedUrl as string | null) ?? null });
      })
      .catch(() => {
        if (!cancelled) setSignedForPath({ path: photoPath, url: null });
      });
    return () => { cancelled = true; };
  }, [itemId, photoPath]);

  const signedUrl = signedForPath.path === photoPath ? signedForPath.url : null;

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setState("error");
      setError("Unsupported format — use JPEG, PNG, or WebP");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setState("error");
      setError("File too large — max 5 MB");
      e.target.value = "";
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setState("uploading");
    setError(null);

    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/workspaces/menu-pricing/items/${itemId}/photo`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((j.error as string) ?? "Upload failed. Try again.");
      }
      const j = await res.json() as { photo_path: string; signedUrl: string | null };
      onPhotoChange(j.photo_path);
      if (j.signedUrl) setSignedForPath({ path: j.photo_path, url: j.signedUrl });
      setState("idle");
    } catch (err: unknown) {
      setState("error");
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    e.target.value = "";
  }, [itemId, onPhotoChange, previewUrl]);

  const handleRemove = useCallback(async () => {
    setState("removing");
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/menu-pricing/items/${itemId}/photo`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not remove photo");
      onPhotoChange(null);
      setSignedForPath({ path: null, url: null });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setState("idle");
    } catch {
      setState("error");
      setError("Could not remove photo");
    }
  }, [itemId, onPhotoChange, previewUrl]);

  const displayedUrl = previewUrl ?? signedUrl;
  const isBusy = state === "uploading" || state === "removing";

  return (
    <div className="shrink-0">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
        disabled={!canEdit || isBusy}
      />
      <div className="relative w-24 aspect-[4/5] rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--background)]">
        {displayedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayedUrl}
            alt="Menu item photo"
            className="w-full h-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!canEdit || isBusy}
            className="w-full h-full flex flex-col items-center justify-center gap-1 text-[var(--muted-foreground)] hover:text-[var(--teal)] hover:bg-[var(--teal-tint-500)] transition-colors disabled:cursor-not-allowed"
            aria-label="Upload photo"
          >
            <Camera size={20} />
            <span className="text-[10px] font-medium leading-tight text-center px-1">Add photo</span>
          </button>
        )}
        {isBusy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 size={20} className="animate-spin text-[var(--teal)]" />
          </div>
        )}
      </div>
      {displayedUrl && canEdit && (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isBusy}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--teal)] hover:underline disabled:opacity-50"
          >
            <Upload size={10} />
            Replace
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isBusy}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--dark-grey)] hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 size={10} />
            Remove
          </button>
        </div>
      )}
      {state === "error" && error && (
        <p className="mt-1 text-[10px] text-red-600 max-w-[96px] leading-tight">{error}</p>
      )}
    </div>
  );
}
