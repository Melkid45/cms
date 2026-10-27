import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = process.env.CMS_TEST_URL || "http://127.0.0.1:3000";
const hosting = await (await fetch(base + "/api/builder/hosting")).json();
assert(!hosting.smtp, "Run workflow tests only with SMTP disabled.");
const get = async () => {
  const response = await fetch(base + "/api/builder");
  assert.equal(response.status, 200);
  return response.json();
};
const save = async (project, id) => {
  const response = await fetch(
    base + "/api/builder" + (id ? "?publish=" + id : ""),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify(project),
    },
  );
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
};
const definitions = JSON.parse(
  await readFile(
    new URL("../src/lib/builder/catalog.json", import.meta.url),
    "utf8",
  ),
);
const entry = definitions.find((d) => d.id === "contact-v7");
const section = {
  id: crypto.randomUUID(),
  variant: entry.id,
  values: Object.fromEntries(entry.fields.map((f) => [f.key, f.value])),
};
const id = crypto.randomUUID(),
  slug = "workflow-" + id.slice(0, 8);
let project = await get();
const page = {
  id,
  slug,
  title: "Workflow verification",
  status: "Draft",
  locale: "en",
  sections: [section],
  seo: { title: "", description: "", keywords: "", image: "", noindex: true },
  updatedAt: "",
};
try {
  project = await save({ ...project, pages: [...project.pages, page] });
  assert.equal((await fetch(base + "/site/" + slug)).status, 404);
  project = await save(project, id);
  assert.equal((await fetch(base + "/site/" + slug)).status, 200);
  const privateText = "UNPUBLISHED-" + crypto.randomUUID();
  const editable = project.pages.find((p) => p.id === id);
  editable.title = privateText;
  editable.sections[0].values[
    entry.fields.find((f) => f.type === "heading").key
  ] = privateText;
  project = await save(project);
  let html = await (await fetch(base + "/site/" + slug)).text();
  assert(
    !html.includes(privateText),
    "Draft content must not leak into HTML or React payload",
  );
  assert.equal(project.pages.find((p) => p.id === id).history.length, 2);
  project = await save(project, id);
  html = await (await fetch(base + "/site/" + slug)).text();
  assert(html.includes(privateText));
  project.pages.find((p) => p.id === id).title = "Demo — enquiry verification";
  project = await save(project, id);
  const tokenResponse = await fetch(base + "/api/forms/token?pageId=" + id);
  const { token } = await tokenResponse.json();
  assert(token);
  const payload = {
    pageId: id,
    sectionId: section.id,
    token,
    values: {
      name: "Demo workflow check",
      email: "demo@example.com",
      message: "This is a local test enquiry.",
    },
    website: "",
  };
  assert.equal(
    (
      await fetch(base + "/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({ ...payload, token: "forged" }),
      })
    ).status,
    403,
  );
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const response = await fetch(base + "/api/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  const messages = await (
    await fetch(base + "/api/builder/submissions")
  ).json();
  const message = messages.find((i) => i.pageId === id);
  assert(message);
  assert.equal(message.values.email, "demo@example.com");
  assert.equal(
    (
      await fetch(base + "/api/builder/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: message.id, read: true }),
      })
    ).status,
    200,
  );
  project.pages.find((p) => p.id === id).deletedAt = new Date().toISOString();
  project = await save(project);
  assert.equal((await fetch(base + "/site/" + slug)).status, 404);
  delete project.pages.find((p) => p.id === id).deletedAt;
  project = await save(project);
  assert.equal((await fetch(base + "/site/" + slug)).status, 200);
  project.pages.find((p) => p.id === id).sections[0].hidden = true;
  project = await save(project, id);
  html = await (await fetch(base + "/site/" + slug)).text();
  assert(!html.includes("<form"), "Hidden sections must not render");
  console.log(
    "Workflows: draft isolation, publish, private payload, history, soft-delete/restore, hidden sections, signed form tokens and durable Inbox verified.",
  );
} finally {
  const current = await get();
  await save({ ...current, pages: current.pages.filter((p) => p.id !== id) });
}
