import { createClient } from "./client";
import { adminFetch } from "@/lib/admin-api";

/**
 * Upload a file directly to Supabase Storage from the browser.
 * Uses a signed upload URL generated server-side (admin client) to bypass
 * both Vercel's 4.5MB body size limit and storage RLS policies.
 * Returns the public URL of the uploaded file.
 */
export async function uploadToStorage(
  bucket: string,
  fileName: string,
  file: File
): Promise<string> {
  // 1. Get a signed upload URL from the server
  const res = await adminFetch("/api/cms/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, fileName }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to get upload URL");
  }

  const { token, publicUrl } = await res.json();

  // 2. Upload directly to Supabase Storage using the signed URL
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(fileName, token, file, {
      contentType: file.type,
    });

  if (error) {
    throw new Error(error.message);
  }

  return publicUrl;
}
