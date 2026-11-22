import assert from "node:assert/strict";
export async function checkSeo({ base, owner }) {
  const get = async () => {
    const r = await fetch(base + "/api/builder", {
      headers: { Cookie: owner },
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const save = async (project, publish) => {
    const r = await fetch(
      base + "/api/builder" + (publish ? "?publish=" + publish : ""),
      {
        method: "PUT",
        headers: {
          Cookie: owner,
          Origin: base,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(project),
      },
    );
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  let project = await get();
  const website = structuredClone(project.website);
  const store = structuredClone(project.store);
  const page = {
    id: crypto.randomUUID(),
    title: "SEO public example",
    slug: "seo-check-" + crypto.randomUUID().slice(0, 8),
    locale: "en",
    status: "Draft",
    sections: [],
    seo: {
      title: "SEO title",
      description: "SEO description",
      keywords: "",
      image: "",
      noindex: false,
    },
    updatedAt: "",
  };
  project.website = { ...project.website, url: "https://example.test" };
  project.pages.push(page);
  project = await save(project);
  const xml = async () => {
    const r = await fetch(base + "/sitemap.xml");
    assert.equal(r.status, 200);
    return r.text();
  };
  assert(!(await xml()).includes(page.slug), "Draft page leaked to sitemap");
  project = await save(project, page.id);
  assert((await xml()).includes("https://example.test/site/" + page.slug));
  project.pages.find((p) => p.id === page.id).seo.noindex = true;
  project = await save(project, page.id);
  assert(!(await xml()).includes(page.slug), "Noindex page leaked to sitemap");
  const robots = await (await fetch(base + "/robots.txt")).text();
  assert.match(robots, /Sitemap: https:\/\/example.test\/sitemap.xml/);
  project.pages = project.pages.filter((p) => p.id !== page.id);
  project.website = website;
  project.store = store;
  await save(project);
  console.log(
    "PASS: sitemap excludes drafts and noindex pages, updates on publish, uses configured domain; robots sitemap URL.",
  );
}
