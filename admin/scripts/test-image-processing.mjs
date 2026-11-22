import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import sharp from "sharp";
const source = fs.readFileSync(
  new URL("../src/lib/builder/image-processing.ts", import.meta.url),
  "utf8",
);
const exports = {};
new Function(
  "require",
  "exports",
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText,
)((name) => {
  assert.equal(name, "sharp");
  return sharp;
}, exports);
const large = await sharp({
  create: { width: 3200, height: 1800, channels: 4, background: "#fd8a32" },
})
  .png()
  .toBuffer();
const { main, thumbnail } = await exports.optimizeImage(large);
assert.equal(main.info.width, 2560);
assert.equal(main.info.height, 1440);
assert(thumbnail.info.width <= 480 && thumbnail.info.height <= 480);
assert.equal((await sharp(main.data).metadata()).format, "webp");
const small = await sharp({
  create: {
    width: 24,
    height: 12,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .png()
  .toBuffer();
const result = await exports.optimizeImage(small);
assert.equal(result.main.info.width, 24);
assert.equal(result.main.info.height, 12);
assert.equal((await sharp(result.main.data).metadata()).hasAlpha, true);
await assert.rejects(() => exports.optimizeImage(Buffer.from("not an image")));
console.log(
  "PASS: large image resizing, separate thumbnails, no upscaling, transparency and invalid image rejection.",
);
