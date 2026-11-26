// Library CSS of public pages, split per section family: src/lib/builder/site-css.json (order +
// content hashes, used by the pages) and src/lib/builder/site-css-content.json (the CSS, imported
// only by the stylesheet route). site.scss stays the single source: its @use list gives the parts
// and their order — base (foundation + index), every family, refresh — and its own rules are the
// last part ("site"). A public page links ONE stylesheet: base, the families it uses, refresh and
// site concatenated in that order (lib/builder/site-css.ts → app/api/site-css/[bundle]), so the
// cascade is the one of the full site.scss while a page loads only the CSS of its own blocks.
// Compiled with sass, then lightningcss with Next's default browser targets (same vendor prefixes
// as the Next build). Run by `npm run build` (prebuild), `npm run import:sections` and
// `npm run site-css`. The dev server compiles the parts live instead.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { siteCssParts } from "./site-css-parts.mjs";
const root = path.resolve(import.meta.dirname, "..");
const parts = await siteCssParts();
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);
await writeFile(
  path.join(root, "src/lib/builder/site-css.json"),
  JSON.stringify(
    { order: parts.map((p) => p.id), hashes: Object.fromEntries(parts.map((p) => [p.id, hash(p.css)])) },
    null,
    1,
  ) + "\n",
);
await writeFile(
  path.join(root, "src/lib/builder/site-css-content.json"),
  JSON.stringify(Object.fromEntries(parts.map((p) => [p.id, p.css]))) + "\n",
);
console.log(`Library CSS split into ${parts.length} parts.`);
