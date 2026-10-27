import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  ts = require("typescript");
const root = path.resolve(import.meta.dirname, ".."),
  loaded = new Map();
function load(filename) {
  if (filename.endsWith(".json"))
    return JSON.parse(readFileSync(filename, "utf8"));
  if (loaded.has(filename)) return loaded.get(filename);
  const exports = {};
  loaded.set(filename, exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "exports", code)((name) => {
    if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
    const file = name.startsWith("@/")
      ? path.join(root, "src", name.slice(2))
      : path.resolve(path.dirname(filename), name);
    const resolved = [file, file + ".ts", file + ".tsx", file + ".json"].find(
      existsSync,
    );
    if (!resolved) throw Error("Missing import " + file);
    return load(resolved);
  }, exports);
  return exports;
}
const { definitions, createSection, safeUrl, switchSection } = load(
  path.join(root, "src/lib/builder/catalog.ts"),
);
const { seedProject } = load(path.join(root, "src/lib/builder/seed.ts"));
const { safeSvg } = load(path.join(root, "src/lib/builder/svg.ts"));
const vector = safeSvg(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#252720"/></svg>',
);
const raster = await require("sharp")(vector).webp().toBuffer();
assert(raster.length > 0);
for (const source of [
  "<!DOCTYPE svg><svg/>",
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://unrelated.example/logo.svg"/></svg>',
])
  assert.throws(() => safeSvg(source));
const { SectionRenderer } = load(
  path.join(root, "src/components/builder/section-renderer.tsx"),
);
const { renderToStaticMarkup } = require("react-dom/server"),
  { createElement } = require("react");
assert.equal(definitions.length, 105);
assert.equal(new Set(definitions.map((d) => d.family)).size, 14);
const project = seedProject();
const { normalizeProject, preparePages, publicProject, hasDraftChanges } = load(
  path.join(root, "src/lib/builder/workflows.ts"),
);
const normalized = normalizeProject(project);
const jsonb = (value) =>
  Array.isArray(value)
    ? value.map(jsonb)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [key, jsonb(value)]),
        )
      : value;
const stored = jsonb(normalized);
assert(
  !hasDraftChanges(stored.pages[0]),
  "JSONB key ordering must not create a draft change",
);
assert.equal(
  preparePages(normalized.pages, stored.pages)[0].history.length,
  0,
  "Saving unchanged JSONB content must not create a version",
);
const draftPage = structuredClone(normalized.pages[0]);
draftPage.title = "Private working title";
let workflow = preparePages([draftPage], normalized.pages);
assert(hasDraftChanges(workflow[0]));
assert.notEqual(
  publicProject({ ...normalized, pages: workflow }).pages[0].title,
  "Private working title",
);
workflow = preparePages(workflow, workflow, draftPage.id);
assert.equal(
  publicProject({ ...normalized, pages: workflow }).pages[0].title,
  "Private working title",
);
assert(!hasDraftChanges(workflow[0]));
assert.equal(workflow[0].history.length, 2);
assert.equal(
  publicProject({
    ...normalized,
    pages: [{ ...workflow[0], deletedAt: new Date().toISOString() }],
  }).pages.length,
  0,
);
const repeated = definitions.find((d) => d.id === "services-v6");
assert(repeated.repeaters.length);
const { collectionItems, newCollectionItem } = load(
  path.join(root, "src/lib/builder/collections.ts"),
);
const cards = createSection(repeated.id);
const group = repeated.repeaters[0];
const values = collectionItems(cards, repeated, group);
const extra = newCollectionItem(repeated, group);
const heading = repeated.fields.find(
  (f) => group.items[0].fields.includes(f.key) && f.type === "textarea",
);
extra.values[heading.key] = "Unique custom service";
cards.collections = { [group.id]: [extra, ...values] };
let cardsHtml = renderToStaticMarkup(
  createElement(SectionRenderer, { section: cards, project }),
);
assert(cardsHtml.includes("Unique custom service"));
cards.hidden = true;
assert.equal(
  renderToStaticMarkup(
    createElement(SectionRenderer, { section: cards, project }),
  ),
  "",
);
cards.hidden = false;
const migratedCards = switchSection(cards, "services-v1");
assert(
  Object.values(migratedCards.collections)
    .flat()
    .some((item) =>
      Object.values(item.values).includes("Unique custom service"),
    ),
);
const oldEnv = { ...process.env };
process.env.CMS_ADMIN_EMAIL = "test@example.com";
process.env.CMS_ADMIN_PASSWORD = "test-password-only";
process.env.CMS_AUTH_SECRET = "x".repeat(48);
const auth = load(path.join(root, "src/lib/builder/auth.ts"));
const session = auth.createSession();
assert(auth.verifySession(session));
assert(!auth.verifySession(session + "bad"));
assert(!auth.verifySession(session, Date.now() + 13 * 3600000));
assert(auth.credentialsMatch("test@example.com", "test-password-only"));
assert(!auth.credentialsMatch("other@example.com", "test-password-only"));
process.env = oldEnv;
assert.equal(project.pages.length, 3);
const { separateLayoutMenus } = load(
  path.join(root, "src/lib/builder/menus.ts"),
);
const legacy = structuredClone(project);
legacy.menus = legacy.menus.filter((m) => m.id !== "footer-main");
legacy.layout.footerMenus = ["main", "footer-contact"];
const migrated = separateLayoutMenus(legacy);
assert(!migrated.layout.footerMenus.includes(migrated.layout.headerMenus[0]));
const header = migrated.menus.find(
  (m) => m.id === migrated.layout.headerMenus[0],
);
const footer = migrated.menus.find(
  (m) => m.id === migrated.layout.footerMenus[0],
);
assert.deepEqual(header.items, footer.items);
footer.items[0].label = "Footer-only edit";
assert.notEqual(header.items[0].label, footer.items[0].label);
assert.deepEqual(
  separateLayoutMenus(migrated),
  migrated,
  "Migration must be idempotent",
);
for (const entry of definitions) {
  assert.equal(
    new Set(entry.fields.map((f) => f.key)).size,
    entry.fields.length,
  );
  assert(
    existsSync(path.join(root, "public", entry.thumbnail)),
    `Missing screenshot: ${entry.id}`,
  );
  const section = createSection(entry.id, entry.id);
  const html = renderToStaticMarkup(
    createElement(SectionRenderer, { section, project, first: true }),
  );
  assert(
    html.includes("heading") || entry.family === "header",
    `Missing shared typography: ${entry.id}`,
  );
  assert(!html.includes("Legacy layout"));
  for (const field of entry.fields.filter(
    (f) => f.type === "image" && f.value.startsWith("/images/"),
  ))
    assert(
      existsSync(path.join(root, "public", field.value)),
      `Missing image: ${field.value}`,
    );
}
const section = createSection("hero-v2", "security-check");
section.values["heading-1"] = "Custom main title";
const switched = switchSection(section, "hero-v1");
const title = definitions
  .find((d) => d.id === "hero-v1")
  .fields.find((f) => f.role === "Main heading");
assert.equal(
  switched.values[title.key],
  "Custom main title",
  "Switching layouts must preserve the title, not replace the masthead",
);
section.values["heading-1"] = "<img src=x onerror=alert(1)>";
section.values["url-1"] = "javascript:alert(1)";
const html = renderToStaticMarkup(
  createElement(SectionRenderer, { section, project, first: true }),
);
assert(html.includes("&lt;img"));
assert(!html.includes('href="javascript:'));
assert.equal(safeUrl("//malicious.example"), "");
assert.equal(safeUrl("data:text/html,x"), "");
assert.equal(safeUrl("/site/home"), "/site/home");
assert.equal((html.match(/<h1\b/g) || []).length, 1);
console.log(
  "105 approved variants render as React, screenshots/assets exist, editable content is escaped, unsafe URLs are rejected, three demo pages are connected.",
);
export { seedProject };
