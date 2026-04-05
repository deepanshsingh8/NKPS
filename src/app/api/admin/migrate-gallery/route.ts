import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/verify-admin";
import { readFile } from "fs/promises";
import { join } from "path";

const STATIC_IMAGES = [
  { category: "campus", alt: "School Campus", path: "images/gallery/g10.jpg" },
  { category: "events", alt: "School Event", path: "images/news/n1.jpg" },
  { category: "sports", alt: "Sports Activities", path: "images/news/n3.jpg" },
  { category: "cultural", alt: "Cultural Programme", path: "images/news/n5.jpg" },
  { category: "events", alt: "Annual Function", path: "images/news/n2.jpg" },
  { category: "academics", alt: "Academic Excellence", path: "images/news/n4.jpg" },
  { category: "cultural", alt: "Performance", path: "images/news/n6.jpg" },
  { category: "campus", alt: "School Life", path: "images/news/n7.jpg" },
  { category: "academics", alt: "Student Achievement", path: "images/gallery/st1.jpg" },
  { category: "academics", alt: "Shining Star", path: "images/gallery/st2.jpg" },
  { category: "academics", alt: "Student Success", path: "images/gallery/st3.jpg" },
  { category: "events", alt: "School Assembly", path: "images/gallery/st4.jpg" },
];

export async function POST() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if migration was already run (avoid duplicates)
  const { count } = await admin
    .from("gallery_images")
    .select("id", { count: "exact", head: true })
    .like("alt", "%School Campus%");

  if (count && count > 0) {
    return NextResponse.json(
      { error: "Static images appear to already be migrated. Aborting to prevent duplicates." },
      { status: 409 }
    );
  }

  const publicDir = join(process.cwd(), "public");
  const results: { path: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < STATIC_IMAGES.length; i++) {
    const img = STATIC_IMAGES[i];
    try {
      const filePath = join(publicDir, img.path);
      const buffer = await readFile(filePath);
      const ext = img.path.split(".").pop();
      const fileName = `migrated-${Date.now()}-${i}.${ext}`;

      const { error: uploadError } = await admin.storage
        .from("gallery")
        .upload(fileName, buffer, {
          contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
        });

      if (uploadError) {
        results.push({ path: img.path, success: false, error: uploadError.message });
        continue;
      }

      const { data: { publicUrl } } = admin.storage.from("gallery").getPublicUrl(fileName);

      const { error: insertError } = await admin
        .from("gallery_images")
        .insert({
          src: publicUrl,
          alt: img.alt,
          category: img.category,
          sort_order: i,
        });

      if (insertError) {
        results.push({ path: img.path, success: false, error: insertError.message });
        continue;
      }

      results.push({ path: img.path, success: true });
    } catch (err) {
      results.push({ path: img.path, success: false, error: String(err) });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  return NextResponse.json({ results, succeeded, total: STATIC_IMAGES.length });
}
