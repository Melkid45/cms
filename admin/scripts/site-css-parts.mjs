// Compiles the parts of components/builder/site.scss (see build-site-css.mjs). Also used live by
// the dev server route app/api/site-css/[part]/route.ts.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const entry = path.join(root, "src/components/builder/site.scss");
export async function siteCssParts() {
  const sass = require("sass");
  const { transform, browserslistToTargets } = require("lightningcss");
  const browserslist = require("browserslist");
  // Next.js default browser targets (no browserslist in package.json).
  const targets = browserslistToTargets(
    browserslist(["chrome 111", "edge 111", "firefox 111", "safari 16.4"]),
  );
  const source = (await readFile(entry, "utf8")).replace(/\r\n/g, "\n");
  // Leading @use statements (with optional "with (...)") = the library parts, in order.
  const uses = [...source.matchAll(/@use\s+"([^"]+)"(\s+with\s*\([^)]*\))?\s*;/g)];
  const own = source.slice(uses.at(-1).index + uses.at(-1)[0].length);
  const compile = (code) => {
    const css = sass.compileString(code, {
      url: new URL(`file:///${entry.replaceAll("\\", "/")}`),
      style: "expanded",
    }).css;
    return transform({ filename: "site.css", code: Buffer.from(css), minify: true, targets })
      .code.toString();
  };
  const parts = [];
  let base = "";
  for (const use of uses) {
    const name = path.basename(use[1]);
    if (["foundation", "index"].includes(name)) {
      base += use[0] + "\n";
      if (name === "index") parts.push({ id: "base", css: compile(base) });
      continue;
    }
    parts.push({ id: name === "refresh" ? "refresh" : name, css: compile(use[0]) });
  }
  parts.push({ id: "site", css: compile(own) });
  return parts;
}
// CLI for the dev server: `node scripts/site-css-parts.mjs <part>+<part>...` prints those parts, in order.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const ids = (process.argv[2] || "").split("+");
  const parts = await siteCssParts();
  const wanted = ids.map((id) => parts.find((p) => p.id === id));
  if (!ids[0] || wanted.some((p) => !p)) process.exit(2);
  process.stdout.write(wanted.map((p) => p.css).join("\n"));
}
