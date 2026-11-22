import assert from "node:assert/strict";

export async function checkProducts({ base, owner, client }) {
  const request = (path, method = "GET", body, cookie = owner) =>
    fetch(base + path, {
      method,
      headers: {
        Origin: base,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  let project = await (await request("/api/builder")).json();
  const originalStore = project.store;
  project.store = {
    ...project.store,
    enabled: false,
    cart: project.store?.cart || "drawer",
  };
  let response = await request("/api/builder", "PUT", project);
  assert.equal(response.status, 200);
  project = await response.json();
  assert.equal((await request("/api/shop/products")).status, 403);
  assert.equal((await request("/api/shop/cart", "POST", {}, "")).status, 404);
  project.store.enabled = true;
  response = await request("/api/builder", "PUT", project);
  assert.equal(response.status, 200);
  assert.equal(
    (await request("/api/shop/products", "GET", undefined, "")).status,
    401,
  );
  assert.equal(
    (await request("/api/shop/products", "GET", undefined, client)).status,
    403,
  );
  const product = {
    id: crypto.randomUUID(),
    revision: 0,
    name: "Alder dining chair",
    slug: "alder-dining-chair",
    sku: "ALD-001",
    status: "Draft",
    description: "Solid oak chair",
    summary: "Made for everyday use",
    images: [],
    price: 24000,
    salePrice: 22000,
    currency: "GBP",
    manageStock: true,
    stock: 12,
    availability: "In stock",
    categories: ["Furniture", "Chairs"],
    attributes: [{ name: "Material", values: ["Oak", "Walnut"] }],
    weight: "4.5 kg",
    dimensions: "80 × 45 × 50 cm",
    seo: { title: "Alder chair", description: "Oak dining chair", image: "" },
    createdAt: "",
    updatedAt: "",
  };
  assert.equal(
    (await request("/api/shop/products", "PUT", product, client)).status,
    403,
  );
  assert.equal(
    (await request("/api/shop/products", "PUT", { ...product, price: 1.5 }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/api/shop/products", "PUT", {
        ...product,
        salePrice: 25000,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/shop/products", "PUT", {
        ...product,
        images: ["javascript:alert(1)"],
      })
    ).status,
    400,
  );
  response = await request("/api/shop/products", "PUT", {
    ...product,
    slug: "ALDER-DINING-CHAIR",
  });
  assert.equal(response.status, 200, await response.clone().text());
  const saved = await response.json();
  assert.equal(saved.revision, 1);
  assert.equal(saved.slug, "alder-dining-chair");
  assert(saved.createdAt);
  assert.equal(
    (await request("/api/shop/products", "PUT", product)).status,
    409,
  );
  assert.equal(
    (
      await request("/api/shop/products", "PUT", {
        ...product,
        id: crypto.randomUUID(),
        sku: "OTHER",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/shop/products", "PUT", {
        ...product,
        id: crypto.randomUUID(),
        slug: "other-chair",
      })
    ).status,
    409,
  );
  const races = await Promise.all([
    request("/api/shop/products", "PUT", { ...saved, name: "First update" }),
    request("/api/shop/products", "PUT", { ...saved, name: "Second update" }),
  ]);
  assert.deepEqual(races.map((item) => item.status).sort(), [200, 409]);
  const list = await (await request("/api/shop/products")).json();
  const updated = list.find((item) => item.id === saved.id);
  assert.equal(updated.revision, 2);
  assert.equal(updated.stock, 12);
  response = await request("/api/shop/products", "PUT", {
    ...updated,
    status: "Archived",
  });
  assert.equal(response.status, 200);
  const archived = await response.json();
  assert.equal(
    (
      await request("/api/shop/products", "PUT", {
        ...archived,
        status: "Published",
      })
    ).status,
    200,
  );
  const persisted = await (await request("/api/shop/products")).json();
  assert.equal(
    persisted.find((item) => item.id === saved.id).status,
    "Published",
  );
  project = await (await request("/api/builder")).json();
  project.store.catalog = {
    enabled: true,
    variant: "sidebar",
    productPage: "panel",
    productCard: "overlay",
    title: "Test collection",
    description: "Catalog test",
    categories: true,
    availability: true,
    search: true,
    attributes: ["Material"],
  };
  response = await request("/api/builder", "PUT", project);
  assert.equal(response.status, 200);
  project = await response.json();
  const catalog = await request("/site/catalog", "GET", undefined, "");
  assert.equal(catalog.status, 200);
  const catalogHtml = await catalog.text();
  assert.match(catalogHtml, /Test collection/);
  assert.match(catalogHtml, /store-product--overlay/);
  let detail = await request(
    "/site/catalog/" + saved.slug,
    "GET",
    undefined,
    "",
  );
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /product-page--panel/);
  const published = persisted.find((item) => item.id === saved.id);
  assert.equal(project.store.catalog.variant, "sidebar");
  assert.equal(project.store.catalog.productPage, "panel");
  assert.equal(project.store.catalog.productCard, "overlay");
  const deniedPreview = await fetch(base + "/product-preview?layout=gallery", {
    redirect: "manual",
    headers: { Cookie: client },
  });
  assert.equal(deniedPreview.status, 307);
  for (const productPage of [
    "split",
    "gallery",
    "spotlight",
    "panel",
    "editorial",
  ]) {
    const preview = await request("/product-preview?layout=" + productPage);
    assert.equal(preview.status, 200);
    assert.match(
      await preview.text(),
      new RegExp("product-page--" + productPage),
    );
  }
  console.log(
    "PASS: five product page previews, persisted card/page selection, public rendering and client preview restrictions.",
  );
  let quoteResponse = await request(
    "/api/shop/cart",
    "POST",
    { [saved.id]: 99 },
    "",
  );
  assert.equal(quoteResponse.status, 200);
  let quote = await quoteResponse.json();
  assert.equal(quote.items[0].quantity, published.stock);
  assert.equal(quote.items[0].price, published.salePrice ?? published.price);
  assert.equal(quote.adjusted, true);
  const unavailable = {
    ...published,
    id: crypto.randomUUID(),
    revision: 0,
    sku: "UNAVAILABLE-QUOTE",
    slug: "unavailable-quote",
    stock: 0,
  };
  assert.equal(
    (await request("/api/shop/products", "PUT", unavailable)).status,
    200,
  );
  const unavailableQuote = await (
    await request("/api/shop/cart", "POST", { [unavailable.id]: 1 }, "")
  ).json();
  assert.deepEqual(unavailableQuote.items, []);
  assert.equal(unavailableQuote.adjusted, true);

  assert.equal(
    (await request("/api/shop/cart", "POST", { [saved.id]: -1 }, "")).status,
    400,
  );
  assert.equal(
    (await request("/api/shop/cart", "POST", { id: saved.id, price: 1 }, ""))
      .status,
    400,
  );

  response = await request("/api/shop/products", "PUT", {
    ...published,
    status: "Draft",
  });
  assert.equal(response.status, 200);
  detail = await request("/site/catalog/" + saved.slug, "GET", undefined, "");
  assert.equal(detail.status, 404);
  quoteResponse = await request(
    "/api/shop/cart",
    "POST",
    { [saved.id]: 1 },
    "",
  );
  quote = await quoteResponse.json();
  assert.deepEqual(quote.items, []);
  assert.equal(quote.adjusted, true);

  const draftCatalog = await (
    await request("/site/catalog", "GET", undefined, "")
  ).text();
  assert(
    !draftCatalog.includes(saved.sku),
    "Draft product must not be sent to the browser",
  );
  const clientChange = structuredClone(project);
  clientChange.store.catalog.enabled = false;
  assert.equal(
    (await request("/api/builder", "PUT", clientChange, client)).status,
    403,
  );
  project.store.catalog.enabled = false;
  response = await request("/api/builder", "PUT", project);
  assert.equal(response.status, 200);
  project = await response.json();
  assert.equal(
    (await request("/site/catalog", "GET", undefined, "")).status,
    404,
  );
  console.log(
    "PASS: live cart quotes, authoritative sale price, stock limits, malformed requests and hidden products.",
  );
  console.log(
    "PASS: catalog settings, public product detail, hidden drafts, disabled catalog and client restrictions.",
  );
  if (originalStore) project.store = originalStore;
  else delete project.store;
  assert.equal((await request("/api/builder", "PUT", project)).status, 200);
  console.log(
    "PASS: product permissions, persistence, prices, unique slugs/SKUs, stock, archive/restore and concurrent saves.",
  );
}
