// Responsive copies of the library's static pictures (public/images/**.jpg|png|webp):
// public/images/_w/<path>-<width>.webp (WebP q72) for every width of MEDIA_WIDTHS below the
// picture's own width, plus src/lib/builder/static-images.json (size + widths per picture),
// which SectionRenderer uses for srcset. Idempotent (existing copies are kept); run by
// `npm run import:sections` and `npm run images:variants`.
import { readdir, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const root = path.resolve(import.meta.dirname, "..");
const images = path.join(root, "public/images");
const out = path.join(images, "_w");
// Same list as MEDIA_WIDTHS in src/lib/builder/responsive-image.ts.
const WIDTHS = [320, 480, 640, 828, 1080, 1440, 1920, 2560];
const manifest = {};
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (file !== out) await walk(file);
      continue;
    }
    if (!/\.(jpe?g|png|webp)$/i.test(entry.name)) continue;
    const rel = path.relative(images, file).replaceAll(path.sep, "/");
    const { width, height } = await sharp(file).metadata();
    const widths = WIDTHS.filter((w) => w < width * 0.9);
    for (const w of widths) {
      const target = path.join(out, rel.replace(/\.[^.]+$/, `-${w}.webp`));
      try {
        await stat(target);
      } catch {
        await mkdir(path.dirname(target), { recursive: true });
        await sharp(file).resize({ width: w }).webp({ quality: 72 }).toFile(target);
      }
    }
    manifest[`/images/${rel}`] = { width, height, widths };
  }
}
await walk(images);
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(
  path.join(root, "src/lib/builder/static-images.json"),
  JSON.stringify(sorted, null, 1) + "\n",
);
console.log(`Responsive copies for ${Object.keys(sorted).length} library pictures.`);
