import assert from "node:assert/strict";
const base = process.env.CMS_TEST_URL || "http://127.0.0.1:3000";
const original = await (await fetch(base + "/api/builder")).json();
assert(
  Array.isArray(original.pages),
  "Start the local development server before running this test.",
);
const put = (project) =>
  fetch(base + "/api/builder", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(project),
  });
try {
  const update = structuredClone(original);
  update.brand.name = "API persistence check";
  const response = await put(update);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.revision, original.revision + 1);
  const read = await (await fetch(base + "/api/builder")).json();
  assert.equal(read.brand.name, "API persistence check");
  assert.equal(
    (await put(original)).status,
    409,
    "Stale writes must not overwrite newer content",
  );
  const duplicate = structuredClone(read);
  duplicate.pages.push({ ...duplicate.pages[0], id: crypto.randomUUID() });
  assert.equal(
    (await put(duplicate)).status,
    400,
    "Duplicate slugs must be rejected",
  );
  const invalid = structuredClone(read);
  invalid.pages[0].sections[0].variant = "legacy-block";
  assert.equal(
    (await put(invalid)).status,
    400,
    "Old or unknown blocks must be rejected",
  );
  const draft = structuredClone(read),
    p = {
      ...structuredClone(draft.pages[0]),
      id: crypto.randomUUID(),
      slug: "api-draft-check",
      status: "Draft",
    };
  draft.pages.push(p);
  assert.equal((await put(draft)).status, 200);
  assert.equal(
    (await fetch(base + "/site/api-draft-check")).status,
    404,
    "Drafts must not become public",
  );
  const bad = new FormData();
  bad.append(
    "file",
    new Blob(["not an image"], { type: "text/plain" }),
    "fake.jpg",
  );
  assert.equal(
    (await fetch(base + "/api/builder/media", { method: "POST", body: bad }))
      .status,
    400,
  );
  const forged = await fetch(base + "/api/builder", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://unrelated.example",
    },
    body: JSON.stringify(read),
  });
  assert.equal(forged.status, 403);
  const current = await (await fetch(base + "/api/builder")).json();
  const shared = structuredClone(current);
  shared.layout.footerMenus = [shared.layout.headerMenus[0]];
  assert.equal(
    (await put(shared)).status,
    400,
    "A menu cannot be assigned to both placements",
  );
  const header = current.menus.find(
    (menu) => menu.id === current.layout.headerMenus[0],
  );
  const headerBefore = structuredClone(header);
  const footer = current.menus.find(
    (menu) => menu.id === current.layout.footerMenus[0],
  );
  footer.items[0].label = "Footer-only API check";
  assert.equal((await put(current)).status, 200);
  const edited = await (await fetch(base + "/api/builder")).json();
  assert.deepEqual(
    edited.menus.find((menu) => menu.id === header.id),
    headerBefore,
    "Editing the footer must preserve the header",
  );
  console.log(
    "API: server persistence, revision conflicts, unique slugs, approved blocks, private drafts, upload validation and same-origin writes verified.",
  );
} finally {
  const current = await (await fetch(base + "/api/builder")).json();
  original.revision = current.revision;
  const restore = await put(original);
  assert.equal(restore.status, 200, "Restore test data");
}
