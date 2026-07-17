// Generates PWA icon assets for the ERP and CMS apps from each app's source
// logo (src/app/icon.png, ~709x714 and NOT square). Run once; commit the
// results. Re-run only when the source logo changes.
//
//   node scripts/generate-pwa-icons.mjs
//
// sharp is already a root dependency. We `contain`-fit the logo onto a square
// canvas rather than resizing to the target box directly, because the source
// is non-square and a plain resize would squash the crest. Navy fill matches
// the manifest theme_color.

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const NAVY = { r: 0x0a, g: 0x16, b: 0x28, alpha: 1 };
const APPS = ["erp", "cms"];

async function fitOnNavy(inputPath, size, insetRatio) {
  // insetRatio 1 = fill the square; <1 leaves a safe-zone margin (for maskable
  // icons Android crops to a circle/squircle).
  const logoSize = Math.round(size * insetRatio);
  const logo = await sharp(inputPath)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: NAVY,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png();
}

for (const app of APPS) {
  const src = join(REPO_ROOT, "apps", app, "src", "app", "icon.png");
  const outDir = join(REPO_ROOT, "apps", app, "public", "icons");
  await mkdir(outDir, { recursive: true });

  // Standard icons: fill the square, small breathing margin.
  await (await fitOnNavy(src, 192, 0.92)).toFile(join(outDir, "icon-192.png"));
  await (await fitOnNavy(src, 512, 0.92)).toFile(join(outDir, "icon-512.png"));

  // Maskable: logo inset to ~80% so the platform mask never clips the crest.
  await (await fitOnNavy(src, 512, 0.8)).toFile(
    join(outDir, "icon-maskable-512.png"),
  );

  // Apple touch icon: 180x180, alpha flattened (iOS renders transparency black).
  await (await fitOnNavy(src, 180, 0.92))
    .flatten({ background: NAVY })
    .toFile(join(outDir, "apple-touch-icon.png"));

  console.log(`Generated PWA icons for apps/${app}/public/icons`);
}
