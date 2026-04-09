import { createClient } from "./client";

/**
 * Upload a file directly to Supabase Storage from the browser.
 * Bypasses API routes to avoid Vercel's 4.5MB body size limit.
 * Returns the public URL of the uploaded file.
 */
export async function uploadToStorage(
  bucket: string,
  fileName: string,
  file: File
): Promise<string> {
  const supabase = createClient();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(fileName);

  return publicUrl;
}
