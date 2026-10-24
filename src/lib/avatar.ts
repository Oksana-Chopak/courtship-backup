import { supabase } from "@/integrations/supabase/client";

/** Resize an image File on the client. Returns a JPEG Blob ≤ maxDim on the long side. */
// 800 px is a full phone width at 2× — plenty for the dossier, and half the
// bytes of the old 1200 px for every avatar on the board (2026-10-24 perf).
export async function resizeImage(file: File, maxDim = 800, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Resize failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

/** Upload a resized JPEG to the user's avatar folder. Returns a long-lived signed URL. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const blob = await resizeImage(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw upErr;
  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 years
  if (error || !data) throw error ?? new Error("Could not sign URL");
  return data.signedUrl;
}
/** Upload one resized JPEG to the user's folder (for multi-photo galleries). Returns a 5-year signed URL. */
export async function uploadPhoto(userId: string, file: File): Promise<string> {
  const blob = await resizeImage(file);
  const path = `${userId}/p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw upErr;
  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 years
  if (error || !data) throw error ?? new Error("Could not sign URL");
  return data.signedUrl;
}
