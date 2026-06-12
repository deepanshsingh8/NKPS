// One-time (re-runnable) optimizer for images already sitting in Supabase
// Storage. New uploads are optimized client-side by uploadToStorage, but
// everything uploaded before that existed is still a full-resolution JPEG/PNG
// (some 1.5-1.7 MB), which is what tanked the public site's mobile PageSpeed.
//
// For every raster image in the target buckets it downscales the longest edge
// to MAX_EDGE and re-encodes to WebP, then OVERWRITES the object at the SAME
// path (upsert) with a 1-year cache-control. Overwriting in place is the whole
// point: every URL stored in section_cards / gallery_images / articles keeps
// working untouched — only the bytes and the content-type change.
//
// Safe by default: runs as a DRY RUN and changes nothing until you pass
// --apply. Re-running is harmless — already-small WebP objects are skipped.
//
// Usage:
//   node --env-file=.env.local scripts/optimize-storage-images.mjs            # dry run
//   node --env-file=.env.local scripts/optimize-storage-images.mjs --apply    # write
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the env file.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKETS = ["site-media", "gallery"];
const MAX_EDGE = 1920;
const QUALITY = 82;
// Only rewrite when it's actually worth it: must save at least this many bytes.
const MIN_SAVINGS_BYTES = 10 * 1024;

const APPLY = process.argv.includes("--apply");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with:  node --env-file=.env.local scripts/optimize-storage-images.mjs"
  );
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fmtKB = (b) => `${(b / 1024).toFixed(0)} KB`;

// Storage .list() returns files (id !== null) and pseudo-folders (id === null).
// Recurse into folders so nested objects (e.g. site-media/section-cards/*) are
// covered too.
async function listAllFiles(bucket, prefix = "") {
  const out = [];
  const pageSize = 100;
  let offset = 0;
  for (;;) {
    const { data, error } = await supa.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        out.push(...(await listAllFiles(bucket, path))); // folder → recurse
      } else {
        out.push(path);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function run() {
  console.log(
    `\n${APPLY ? "APPLYING" : "DRY RUN"} — image optimization for: ${BUCKETS.join(", ")}\n`
  );

  let totalBefore = 0;
  let totalAfter = 0;
  let rewritten = 0;
  let skipped = 0;

  for (const bucket of BUCKETS) {
    const paths = await listAllFiles(bucket);
    console.log(`\n## ${bucket} — ${paths.length} objects`);

    for (const path of paths) {
      const { data: blob, error: dlErr } = await supa.storage
        .from(bucket)
        .download(path);
      if (dlErr || !blob) {
        console.log(`  ! skip (download failed): ${path}`);
        skipped++;
        continue;
      }

      const input = Buffer.from(await blob.arrayBuffer());

      let meta;
      try {
        meta = await sharp(input).metadata();
      } catch {
        console.log(`  · skip (not a raster image): ${path}`);
        skipped++;
        continue;
      }

      // Already a small-enough WebP within bounds → nothing to gain.
      const withinBounds =
        Math.max(meta.width ?? 0, meta.height ?? 0) <= MAX_EDGE;
      if (meta.format === "webp" && withinBounds) {
        skipped++;
        continue;
      }

      let output;
      try {
        output = await sharp(input)
          .rotate() // bake in EXIF orientation before stripping metadata
          .resize({
            width: MAX_EDGE,
            height: MAX_EDGE,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: QUALITY })
          .toBuffer();
      } catch (e) {
        console.log(`  ! skip (encode failed): ${path} — ${e.message}`);
        skipped++;
        continue;
      }

      const saved = input.length - output.length;
      if (saved < MIN_SAVINGS_BYTES) {
        skipped++;
        continue;
      }

      totalBefore += input.length;
      totalAfter += output.length;
      rewritten++;
      console.log(
        `  ${APPLY ? "✓" : "→"} ${path}  ${fmtKB(input.length)} → ${fmtKB(
          output.length
        )}  (-${fmtKB(saved)})`
      );

      if (APPLY) {
        const { error: upErr } = await supa.storage
          .from(bucket)
          .upload(path, output, {
            upsert: true,
            contentType: "image/webp",
            cacheControl: "31536000",
          });
        if (upErr) {
          console.log(`    ! upload failed: ${upErr.message}`);
          rewritten--;
          totalBefore -= input.length;
          totalAfter -= output.length;
        }
      }
    }
  }

  console.log(
    `\n${"=".repeat(48)}\n` +
      `${APPLY ? "Rewrote" : "Would rewrite"}: ${rewritten} objects\n` +
      `Skipped: ${skipped}\n` +
      `Total: ${fmtKB(totalBefore)} → ${fmtKB(totalAfter)}  ` +
      `(saved ${fmtKB(totalBefore - totalAfter)})\n`
  );
  if (!APPLY && rewritten > 0) {
    console.log("Re-run with --apply to write these changes.\n");
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
