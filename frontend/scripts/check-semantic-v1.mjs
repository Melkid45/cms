import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const html = readFileSync(
  new URL("../dist/semantic-v1.html", import.meta.url),
  "utf8",
);
assert.equal((html.match(/<section\b/g) || []).length, 14);
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.ok(
  !/tailwind|landing-demo|spacing--|flex--|grid--|padding--|heading--/.test(
    html,
  ),
);
assert.equal((html.match(/data-timeline-point\b/g) || []).length, 5);
assert.equal((html.match(/data-slider-item\b/g) || []).length, 4);
assert.match(html, /data-validate/);
for (const name of ["container", "grid", "mixins", "tokens", "button", "typography"]) {
  assert.ok(readFileSync(new URL(`../src/semantic-v1/common/_${name}.scss`, import.meta.url), "utf8").length > 0);
}
const faqCss = readFileSync(new URL("../src/semantic-v1/blocks/faq/faq.scss", import.meta.url), "utf8");
assert.match(faqCss, /background: transparent/);
assert.match(faqCss, /border: 1px solid var\(--line\)/);
assert.match(faqCss, /border-radius: var\(--radius\)/);
for (const name of readdirSync(
  new URL("../src/semantic-v1/blocks/", import.meta.url),
)) {
  const source = readFileSync(
    new URL(`../src/semantic-v1/blocks/${name}/${name}.html`, import.meta.url),
    "utf8",
  );
  assert.ok(!/style=|(?:md|lg|xl):/.test(source), name);
  assert.match(source, new RegExp(`href="\\./${name}\\.scss"`), name);
  assert.ok(
    readFileSync(
      new URL(
        `../src/semantic-v1/blocks/${name}/${name}.scss`,
        import.meta.url,
      ),
      "utf8",
    ).length > 0,
  );
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length);
for (const match of html.matchAll(/href="#([^"]+)"/g))
  assert.ok(ids.includes(match[1]), match[1]);
console.log(
  "Semantic v1: 14 sections, isolated styles, no layout utilities, working interaction hooks and valid anchors.",
);
