import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
export async function checkProductWorkflows({
  base,
  owner,
  client,
  directory,
  cronSecret,
}) {
  const request = (path, method = "GET", body, cookie = owner) =>
    fetch(base + path, {
      method,
      redirect: "manual",
      headers: {
        Origin: base,
        ...(body ? { "Content-Type": "application/json" } : {}),
        Cookie: cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const get = async () => {
    const r = await request("/api/builder");
    assert.equal(r.status, 200);
    return r.json();
  };
  const save = async (project, cookie = owner, query = "") => {
    const r = await request("/api/builder" + query, "PUT", project, cookie);
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  const defs = JSON.parse(
    await readFile(
      new URL("../src/lib/builder/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  let project = await get();
  const pageId = project.pages[0].id;
  const section = project.pages[0].sections.find((section) =>
    section.variant.startsWith("hero-"),
  );
  assert(section);
  const entry = defs.find((def) => def.id === section.variant),
    text = entry.fields.find((field) => field.type === "heading"),
    image = entry.fields.find((field) => field.type === "image");
  assert(text && image);
  section.clientAccess = {
    text: false,
    images: true,
    reorder: false,
    lockedFields: [],
  };
  project.pages[0].clientAccess = { edit: true, publish: false };
  project = await save(project);
  const forbidden = async (change, query = "") => {
    const value = structuredClone(project);
    change(
      value.pages.find((page) => page.id === pageId),
      value,
    );
    const r = await request("/api/builder" + query, "PUT", value, client);
    assert.equal(r.status, 403, await r.clone().text());
  };
  await forbidden((page) => {
    page.sections.find((s) => s.id === section.id).values[text.key] =
      "Forbidden text";
  });
  await forbidden((page) => {
    page.sections.find((s) => s.id === section.id).clientAccess.text = true;
  });
  await forbidden((page) => {
    const index = page.sections.findIndex((s) => s.id === section.id);
    const target = index === 0 ? 1 : 0;
    [page.sections[index], page.sections[target]] = [
      page.sections[target],
      page.sections[index],
    ];
  });
  await forbidden(() => {}, "?publish=" + pageId);
  const imageValue = structuredClone(project);
  imageValue.pages[0].sections.find((s) => s.id === section.id).values[
    image.key
  ] = project.media.find(
    (media) => media.url !== section.values[image.key],
  ).url;
  project = await save(imageValue, client);
  project.pages[0].sections.find(
    (s) => s.id === section.id,
  ).clientAccess.lockedFields = [image.key];
  project = await save(project);
  await forbidden((page) => {
    page.sections.find((s) => s.id === section.id).values[image.key] =
      "/images/hero/workspace.jpg?new=1";
  });
  project.pages[0].clientAccess = { edit: false, publish: false };
  project = await save(project);
  await forbidden((page) => {
    page.sections.find((s) => s.id !== section.id).values["heading-1"] =
      "No edits allowed";
  });
  for (const page of project.pages) {
    delete page.clientAccess;
    for (const section of page.sections) delete section.clientAccess;
  }
  project = await save(project);
  const published = JSON.stringify(project.pages[0].published);
  project.pages[0].sections.find((s) => s.id === section.id).values[text.key] =
    "Autosaved draft one";
  project = await save(project, client, "?autosave=1");
  const versions = project.pages[0].history.length;
  project.pages[0].sections.find((s) => s.id === section.id).values[text.key] =
    "Autosaved draft two 👋";
  project = await save(project, client, "?autosave=1");
  assert.equal(
    project.pages[0].history.length,
    versions,
    "Autosaves coalesce into one draft checkpoint",
  );
  assert.equal(
    JSON.stringify(project.pages[0].published),
    published,
    "Autosaving never publishes",
  );
  const messages = await (
    await request("/api/builder/submissions", "GET", undefined, client)
  ).json();
  assert(messages.length);
  const message = messages[0],
    note = "Internal-only note " + crypto.randomUUID();
  let r = await request(
    "/api/builder/submissions",
    "PATCH",
    {
      id: message.id,
      revision: message.revision || 0,
      internalNote: note,
    },
    client,
  );
  assert.equal(r.status, 200);
  const updated = await r.json();
  assert.equal(updated.internalNote, note);
  assert.equal(
    (
      await request(
        "/api/builder/submissions",
        "PATCH",
        {
          id: message.id,
          revision: message.revision || 0,
          internalNote: "Stale note",
        },
        client,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/api/builder/submissions",
        "PATCH",
        { id: message.id, revision: updated.revision, status: "In progress" },
        client,
      )
    ).status,
    400,
  );
  assert(!(await (await fetch(base + "/site/home")).text()).includes(note));
  assert.equal(
    (await request("/api/builder/backups", "GET", undefined, client)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/builder/backups",
        "POST",
        { action: "create" },
        client,
      )
    ).status,
    403,
  );
  r = await request("/api/builder/backups", "POST", { action: "create" });
  assert.equal(r.status, 201, await r.clone().text());
  const backup = await r.json();
  assert(backup.media > 0);
  const file = join(directory, "backups", backup.id + ".json");
  const archive = JSON.parse(await readFile(file, "utf8"));
  const reversed = (value) =>
    Array.isArray(value)
      ? value.map(reversed)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, item]) => [key, reversed(item)]),
          )
        : value;
  await writeFile(file, JSON.stringify(reversed(archive)));
  assert.equal(
    (
      await request("/api/builder/backups", "POST", {
        action: "verify",
        id: backup.id,
      })
    ).status,
    200,
    "JSONB key order must not invalidate a backup",
  );
  const download = await request("/api/builder/backups?download=" + backup.id);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /attachment/);
  const exported = await download.json();
  assert.equal(exported.checksum, archive.checksum);
  assert(exported.assets.every((asset) => asset.data && asset.sha256));
  assert(!("accounts" in exported));
  assert(!("smtp" in exported));
  project = await get();
  const originalName = project.brand.name;
  project.brand.name = "Changed after backup";
  project = await save(project);
  const managed = project.media.find((media) =>
    media.url.startsWith("/api/builder/media/"),
  );
  assert(managed);
  const asset = archive.assets.find((asset) => asset.url === managed.url);
  assert(asset);
  await unlink(
    join(directory, "media", managed.url.split("/").at(-1) + ".webp"),
  );
  assert.equal(
    (
      await request("/api/builder/backups", "POST", {
        action: "restore",
        id: backup.id,
        revision: project.revision - 1,
        confirm: "RESTORE",
      })
    ).status,
    409,
  );
  r = await request("/api/builder/backups", "POST", {
    action: "restore",
    id: backup.id,
    revision: project.revision,
    confirm: "RESTORE",
  });
  assert.equal(r.status, 200, await r.clone().text());
  project = await r.json();
  assert.equal(project.brand.name, originalName);
  const restored = project.media.find((media) => media.id === managed.id);
  assert.notEqual(restored.url, managed.url);
  const restoredImage = await fetch(base + restored.url);
  assert.equal(restoredImage.status, 200);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await restoredImage.arrayBuffer()))
      .digest("hex"),
    asset.sha256,
    "Independent media bytes survive loss of the original file",
  );
  assert(
    (await (await request("/api/builder/backups")).json()).some(
      (copy) => copy.id === "safety",
    ),
  );
  assert.equal(
    (await request("/api/builder", "GET", undefined, client)).status,
    200,
  );
  assert(
    (
      await (
        await request("/api/builder/submissions", "GET", undefined, client)
      ).json()
    ).some((row) => row.internalNote === note),
    "Restoring website does not roll back enquiries",
  );
  const corrupt = structuredClone(archive);
  corrupt.assets[0].data =
    (corrupt.assets[0].data[0] === "A" ? "B" : "A") +
    corrupt.assets[0].data.slice(1);
  await writeFile(file, JSON.stringify(corrupt));
  assert.equal(
    (
      await request("/api/builder/backups", "POST", {
        action: "verify",
        id: backup.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/builder/backups", "POST", {
        action: "restore",
        id: backup.id,
        revision: project.revision,
        confirm: "RESTORE",
      })
    ).status,
    400,
  );
  assert.equal(
    (await get()).revision,
    project.revision,
    "Corrupt backups cannot mutate the website",
  );
  assert.equal(
    (await request("/api/builder/backups?id=" + backup.id, "DELETE")).status,
    200,
  );
  const oldId = crypto.randomUUID(),
    recentId = crypto.randomUUID();
  const oldFile = join(directory, "backups", oldId + ".json");
  const recentFile = join(directory, "backups", recentId + ".json");
  await writeFile(
    oldFile,
    JSON.stringify({
      ...archive,
      id: oldId,
      createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    }),
  );
  await writeFile(
    recentFile,
    JSON.stringify({
      ...archive,
      id: recentId,
      createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    }),
  );
  assert.equal((await fetch(base + "/api/cron/backups")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/cron/backups", {
        headers: { Authorization: "Bearer incorrect" },
      })
    ).status,
    401,
  );
  assert(await readFile(oldFile));
  const cleanup = await fetch(base + "/api/cron/backups", {
    headers: { Authorization: "Bearer " + cronSecret },
  });
  assert.equal(cleanup.status, 200);
  assert.equal((await cleanup.json()).removed, 1);
  await assert.rejects(readFile(oldFile), { code: "ENOENT" });
  assert(await readFile(recentFile));
  await unlink(recentFile);
  // Expired copies cannot be downloaded between scheduled runs either.
  await writeFile(
    oldFile,
    JSON.stringify({
      ...archive,
      id: oldId,
      createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    }),
  );
  assert.equal(
    (await request("/api/builder/backups?download=" + oldId)).status,
    404,
  );
  await assert.rejects(readFile(oldFile), { code: "ENOENT" });
  console.log(
    "PASS: page/field/image/reorder/publish permissions, coalesced private autosaves, enquiry notes conflicts and rejected status updates, full backup restoration and seven-day expiry; protected scheduled cleanup preserves recent copies.",
  );
}
