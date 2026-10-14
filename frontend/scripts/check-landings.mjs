import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const pages = [
  "index-v2.html",
  "design-preview.html",
  "design-preview-v3.html",
];
const sectionIds = [
  "home",
  "approach",
  "programs",
  "coach",
  "story",
  "included",
  "session",
  "results",
  "pricing",
  "first-session",
  "faq",
  "testimonials",
  "insights",
];
for (const page of pages) {
  const html = readFileSync(resolve("dist", page), "utf8");
  assert.equal(
    (html.match(/<section\b/g) || []).length,
    14,
    `${page}: section count`,
  );
  assert.equal(
    (html.match(/<h1\b/g) || []).length,
    1,
    `${page}: one main heading`,
  );
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page}: unique IDs`);
  const positions = sectionIds.map((id) => html.indexOf(`id="${id}"`));
  assert(
    positions.every((position) => position >= 0),
    `${page}: required sections`,
  );
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    `${page}: section order`,
  );
  assert(ids.includes("contact"), `${page}: contact form`);
  for (const [, href] of html.matchAll(/href="#([^"]*)"/g))
    assert(ids.includes(href), `${page}: broken #${href}`);
  assert(
    !/href=""|Lorem ipsum|CleanSpace|eco-certified|deep clean/i.test(html),
    `${page}: no stale placeholder content`,
  );
  for (const [, src] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g))
    assert(
      existsSync(resolve("dist", src.slice(1))),
      `${page}: missing ${src}`,
    );
  assert.equal(
    (html.match(/data-timeline-point/g) || []).length,
    5,
    `${page}: five milestones`,
  );
  for (const price of ["199 €", "499 €", "999 €"])
    assert(html.includes(price), `${page}: ${price}`);
  for (const name of [
    "Priya Nair",
    "Daniel Brooks",
    "Maya Chen",
    "Alex Romero",
  ])
    assert(html.includes(name), `${page}: review ${name}`);
  assert(
    html.replace(/\s+/g, " ").includes("no information is sent or stored"),
    `${page}: demo form notice`,
  );
  console.log(`${page}: 14 sections, valid anchors/assets/content`);
}
