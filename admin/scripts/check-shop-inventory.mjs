import {checkPayments} from "./check-payments.mjs";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
export async function checkShopInventory({
  base,
  owner,
  client,
  directory,
  mailSink,
}) {
  if (directory)
    assert.deepEqual(
      JSON.parse(await readFile(`${directory}/recovery-check.json`, "utf8")),
      { completed: true },
      "An interrupted local commit is recovered before reads",
    );
  let ip = 1;
  const request = (path, method = "GET", body, cookie = owner) =>
    fetch(base + path, {
      method,
      headers: {
        Cookie: cookie,
        Origin: base,
        "Content-Type": "application/json",
        "x-forwarded-for": `198.51.100.${ip++}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const json = async (r, status = 200) => {
    assert.equal(r.status, status, await r.clone().text());
    return r.json();
  };
  const defs = JSON.parse(
    await readFile(
      new URL("../src/lib/builder/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const def = defs.find((d) => d.id === "pricing-v22");
  let project = await json(await request("/api/builder"));
  const makePage = (id, slug) => ({
    id,
    title: slug,
    slug,
    locale: "en",
    status: "Draft",
    sections: [
      {
        id: `${id}-block`,
        variant: "pricing-v22",
        values: Object.fromEntries(def.fields.map((f) => [f.key, f.value])),
      },
    ],
    seo: {
      title: slug,
      description: "Inventory test",
      keywords: "",
      image: "",
      noindex: false,
    },
    updatedAt: new Date().toISOString(),
  });
  project.pages.push(
    makePage("inventory-simple", "inventory-simple"),
    makePage("inventory-variants", "inventory-variants"),
  );
  project.forms = { ...project.forms, enabled: true, recipient: "" };
  project.store = { ...project.store, checkout: "popup" };
  project = await json(
    await request("/api/builder?publish=inventory-simple", "PUT", project),
  );
  project = await json(
    await request("/api/builder?publish=inventory-variants", "PUT", project),
  );
  const simple = await json(
    await request("/api/builder/catalog", "POST", {
      sku: "INV-SIMPLE",
      price: 100,
      qty: 1,
      text: { en: { name: "Inventory simple", slug: "inventory-simple" } },
      pages: { en: "inventory-simple" },
    }),
  );
  const variants = await json(
    await request("/api/builder/catalog", "POST", {
      sku: "INV-PARENT",
      price: 100,
      variants: [
        {
          id: "black-m",
          name: "Black / Medium",
          sku: "INV-BLACK-M",
          price: 150,
          qty: 1,
          attributes: [
            { key: "Colour", value: "Black" },
            { key: "Size", value: "M" },
          ],
          images: ["/images/hero/details.jpg"],
        },
        {
          id: "white-l",
          name: "White / Large",
          sku: "INV-WHITE-L",
          price: 175,
          qty: 2,
          images: ["/images/hero/studio.jpg"],
        },
      ],
      text: { en: { name: "Inventory variants", slug: "inventory-variants" } },
      pages: { en: "inventory-variants" },
    }),
  );
  const catalog = async () => await json(await request("/api/builder/catalog"));
  const product = async (id) =>
    (await catalog()).catalog.products.find((p) => p.id === id);
  const tokens = new Map();
  const checkout = async (p, variantId, qty = 1, extra = {}) => {
    const pageId = p.pages.en;
    if (!tokens.has(pageId))
      tokens.set(
        pageId,
        (async () => {
          const value = await json(
            await request(`/api/forms/token?site=default&pageId=${pageId}`),
          );
          await delay(1050);
          return value;
        })(),
      );
    const token = await tokens.get(pageId);
    const items = [
      {
        pageId,
        sectionId: `${pageId}-block`,
        productId: p.id,
        name: p.text.en.name,
        variantId,
        qty,
        options: [],
      },
    ];
    return request("/api/shop/orders", "POST", {
      site: "default",
      pageId,
      token: token.token,
      via: "popup",
      items,
      customer: {
        type: "private",
        name: "Inventory test",
        phone: "+44123456789",
        email: "",
      },
      delivery: { method: "pickup" },
      ...extra,
    });
  };
  const patch = async (o, status) =>
    json(
      await request("/api/builder/shop-orders", "PATCH", {
        id: o.id,
        revision: o.revision,
        status,
      }),
    );
  let settings = await json(await request("/api/builder/shop-settings"));
  settings = await json(
    await request("/api/builder/shop-settings", "PUT", {
      ...settings,
      currency: "USD",
      delivery: {
        ...settings.delivery,
        mode: "flat",
        fee: 7.5,
        freeFrom: 200,
        country: "other",
      },
    }),
  );
  assert.equal(
    (
      await request("/api/builder/shop-settings", "PUT", {
        ...settings,
        delivery: { ...settings.delivery, pickup: false, shipping: false },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/builder/shop-settings", "PUT", {
        ...settings,
        revision: 0,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/api/builder/shop-settings",
        "PUT",
        { ...settings, brand: {} },
        client,
      )
    ).status,
    400,
    "Client settings cannot change design",
  );
  settings = await json(
    await request("/api/builder/shop-settings", "PUT", settings, client),
  );
  const publicSettings = await json(
    await request("/api/shop/orders?site=default"),
  );
  assert.equal(publicSettings.settings.notifications.recipient, "");
  const staleItems = [
    {
      pageId: variants.pages.en,
      sectionId: `${variants.pages.en}-block`,
      productId: variants.id,
      name: variants.text.en.name,
      variantId: "white-l",
      qty: 1,
      options: [],
      expectedPrice: 1,
    },
  ];
  assert.equal(
    (await checkout(variants, "white-l", 1, { items: staleItems })).status,
    409,
    "Stale prices never create an order",
  );
  const delivered = await json(
    await checkout(variants, "white-l", 1, {
      delivery: { method: "delivery", address: "Test address" },
    }),
  );
  assert.equal(delivered.delivery, 7.5);
  assert.equal(delivered.total, 182.5);
  let deliveryOrders = await json(await request("/api/builder/shop-orders"));
  await patch(
    deliveryOrders.find((o) => o.number === delivered.number),
    "cancelled",
  );
  const repeatKey = "inventory-checkout-repeat-0001";
  const retryResponses = await Promise.all([
    checkout(variants, "white-l", 1, { requestId: repeatKey }),
    checkout(variants, "white-l", 1, { requestId: repeatKey }),
  ]);
  const receipts = await Promise.all(retryResponses.map((r) => json(r)));
  assert.equal(
    receipts[0].number,
    receipts[1].number,
    "Retries share one order",
  );
  assert.equal(
    (await product(variants.id)).variants.find((v) => v.id === "white-l")
      .reserved,
    1,
    "Retries reserve stock once",
  );
  assert.equal(
    (await checkout(variants, "white-l", 2, { requestId: repeatKey })).status,
    409,
    "Cannot reuse checkout key for different contents",
  );
  let replayOrders = await json(await request("/api/builder/shop-orders"));
  let replayOrder = replayOrders.find((o) => o.number === receipts[0].number);
  assert.equal(replayOrder.currency, "USD");
  await patch(replayOrder, "cancelled");
  assert.equal(
    (
      await json(
        await checkout(variants, "white-l", 1, { requestId: repeatKey }),
      )
    ).number,
    receipts[0].number,
  );
  settings = await json(
    await request("/api/builder/shop-settings", "PUT", {
      ...settings,
      currency: "EUR",
    }),
  );
  const raced = await Promise.all([checkout(simple), checkout(simple)]);
  assert.deepEqual(
    raced.map((r) => r.status).sort(),
    [200, 409],
    "Only one buyer reserves the final unit",
  );
  let body = await raced.find((r) => r.status === 200).json();
  let orders = await json(await request("/api/builder/shop-orders"));
  let order = orders.find((o) => o.number === body.number);
  assert(order, "Checkout persisted an order");
  let p = await product(simple.id);
  assert.equal(p.qty, 1);
  assert.equal(p.reserved, 1);
  assert.equal(
    (
      await request("/api/builder/catalog", "PATCH", {
        id: p.id,
        revision: p.revision,
        qty: 0,
      })
    ).status,
    400,
    "Cannot erase reserved stock",
  );
  assert.equal(
    (await request("/api/builder/catalog", "DELETE", { ids: [p.id] })).status,
    400,
    "Cannot delete a reserved product",
  );
  order = await patch(order, "cancelled");
  p = await product(simple.id);
  assert.equal(p.qty, 1);
  assert.equal(p.reserved, 0);
  order = await patch(order, "cancelled");
  assert.equal(
    (await product(simple.id)).qty,
    1,
    "Repeated cancellation never restores twice",
  );
  order = await patch(order, "confirmed");
  assert.equal((await product(simple.id)).reserved, 1);
  order = await patch(order, "shipped");
  p = await product(simple.id);
  assert.equal(p.qty, 0);
  assert.equal(p.reserved, 0);
  order = await patch(order, "done");
  assert.equal(
    (await product(simple.id)).qty,
    0,
    "Completion after shipping never decrements twice",
  );
  order = await patch(order, "cancelled");
  assert.equal(
    (await product(simple.id)).qty,
    1,
    "Cancelling a completed order restores its physical stock",
  );
  assert.equal(
    (await checkout(variants)).status,
    409,
    "A variant product requires an explicit variation",
  );
  const variantOrderResult = await json(await checkout(variants, "black-m"));
  orders = await json(await request("/api/builder/shop-orders"));
  let variantOrder = orders.find((o) => o.number === variantOrderResult.number);
  assert.equal(variantOrder.items[0].unitPrice, 150);
  assert.equal(variantOrder.items[0].sku, "INV-BLACK-M");
  assert.equal(variantOrder.items[0].variantId, "black-m");
  assert.equal(
    (await checkout(variants, "black-m")).status,
    409,
    "Variation stock is independent and cannot oversell",
  );
  const whites = await Promise.all([
    checkout(variants, "white-l"),
    checkout(variants, "white-l"),
  ]);
  assert(
    whites.every((r) => r.status === 200),
    "Two buyers reserve two separate available units",
  );
  let v = await product(variants.id);
  assert.equal(v.variants.find((v) => v.id === "white-l").reserved, 2);
  assert.equal(v.variants.find((v) => v.id === "black-m").reserved, 1);
  assert.equal(
    (
      await request("/api/builder/catalog", "PUT", {
        id: v.id,
        revision: v.revision,
        product: {
          ...v,
          variants: v.variants.filter((v) => v.id !== "black-m"),
        },
      })
    ).status,
    400,
    "Reserved variation cannot be removed",
  );
  const edited = await json(
    await request("/api/builder/catalog", "PUT", {
      id: v.id,
      revision: v.revision,
      product: {
        ...v,
        variants: v.variants.map((v) => ({ ...v, reserved: 0 })),
      },
    }),
  );
  assert.equal(
    edited.variants.find((v) => v.id === "white-l").reserved,
    2,
    "Server preserves reservations when editing products",
  );
  variantOrder = await patch(variantOrder, "done");
  assert.equal(
    (await product(variants.id)).variants.find((v) => v.id === "black-m").qty,
    0,
  );
  variantOrder = await patch(variantOrder, "cancelled");
  assert.equal(
    (await product(variants.id)).variants.find((v) => v.id === "black-m").qty,
    1,
  );
  // A failed multi-line order must roll back every earlier allocation.
  const beforeCount = (await json(await request("/api/builder/shop-orders")))
    .length;
  const pageId = simple.pages.en,
    token = (await tokens.get(pageId)).token;
  const repeated = {
    pageId,
    sectionId: `${pageId}-block`,
    productId: simple.id,
    name: simple.text.en.name,
    qty: 1,
    options: [],
  };
  assert.equal(
    (
      await request("/api/shop/orders", "POST", {
        site: "default",
        pageId,
        token,
        via: "popup",
        items: [repeated, repeated],
        customer: {
          type: "private",
          name: "Test",
          phone: "+44123456789",
          email: "",
        },
        delivery: { method: "pickup" },
      })
    ).status,
    409,
  );
  assert.equal((await product(simple.id)).reserved, 0);
  assert.equal(
    (await json(await request("/api/builder/shop-orders"))).length,
    beforeCount,
    "Failed checkout leaves neither an order nor partial reservations",
  );
  const heldResult = await json(await checkout(simple));
  let held = (await json(await request("/api/builder/shop-orders"))).find(
    (o) => o.number === heldResult.number,
  );
  assert.equal(
    (
      await request("/api/builder/shop-orders", "PATCH", {
        id: held.id,
        revision: held.revision + 10,
        status: "done",
      })
    ).status,
    409,
    "Stale status changes never move stock",
  );
  await json(
    await request("/api/builder/shop-orders", "DELETE", { ids: [held.id] }),
  );
  assert.equal(
    (await product(simple.id)).reserved,
    0,
    "Deleting an unfulfilled order releases stock",
  );
  p = await product(simple.id);
  await json(
    await request("/api/builder/catalog", "PUT", {
      id: p.id,
      revision: p.revision,
      product: { ...p, qty: null },
    }),
  );
  const unlimited = await Promise.all([checkout(simple), checkout(simple)]);
  assert(
    unlimited.every((r) => r.status === 200),
    "Unlimited products remain unlimited",
  );
  assert.equal((await product(simple.id)).qty, null);
  // Real SMTP protocol against a loopback sink: no messages leave this machine.
  let smtp = await json(await request("/api/builder/smtp"));
  const { passwordConfigured: _password, ready: _ready, ...smtpFields } = smtp;
  void _password;void _ready;
  await json(
    await request("/api/builder/smtp", "PUT", {
      ...smtpFields,
      source: "hosting",
    }),
  );
  settings = await json(await request("/api/builder/shop-settings"));
  settings = await json(
    await request("/api/builder/shop-settings", "PUT", {
      ...settings,
      notifications: {
        recipient: "owner@example.test",
        buyerConfirmation: true,
      },
    }),
  );
  const beforeMail = mailSink.messages.length;
  mailSink.state.reject = true;
  const mailed = await json(
    await checkout(simple, undefined, 1, {
      customer: {
        type: "private",
        name: "<script>bad</script>",
        phone: "+44123456789",
        email: "buyer@example.test",
      },
    }),
  );
  let mailOrder = (await json(await request("/api/builder/shop-orders"))).find(
    (o) => o.number === mailed.number,
  );
  assert.equal(mailOrder.email, "failed");
  assert.equal(mailOrder.buyerEmail, "failed");
  const mailOrderRevision = mailOrder.revision;
  mailOrder = await json(
    await request(
      "/api/builder/shop-orders",
      "PATCH",
      {
        id: mailOrder.id,
        revision: mailOrder.revision,
        note: "PRIVATE INTERNAL NOTE",
      },
      client,
    ),
  );
  assert.equal(mailOrder.history.at(-1).kind, "note");
  const preview = await request(
    `/api/builder/shop-orders?id=${mailOrder.id}&preview=buyer`,
  );
  const previewHtml = await preview.text();
  assert.equal(preview.status, 200);
  assert(!previewHtml.includes("PRIVATE INTERNAL NOTE"));
  assert(!previewHtml.includes("<script>bad</script>"));
  mailSink.state.reject = false;
  const retries = await Promise.all([
    request(
      "/api/builder/shop-orders",
      "POST",
      { id: mailOrder.id, target: "shop" },
      client,
    ),
    request(
      "/api/builder/shop-orders",
      "POST",
      { id: mailOrder.id, target: "shop" },
      client,
    ),
  ]);
  assert.deepEqual(retries.map((r) => r.status).sort(), [200, 409]);
  mailOrder = await json(
    await request(
      "/api/builder/shop-orders",
      "POST",
      { id: mailOrder.id, target: "buyer" },
      client,
    ),
  );
  assert.equal(mailOrder.email, "sent");
  assert.equal(mailOrder.buyerEmail, "sent");
  assert.equal(
    mailSink.messages.length - beforeMail,
    2,
    "Retry sends each email once",
  );
  assert(
    mailSink.messages.every((m) => !m.includes("PRIVATE INTERNAL NOTE")),
    "Notes never enter email",
  );
  assert(
    mailSink.messages
      .slice(-2)
      .every((m) => m.includes("text/html") && m.includes("text/plain")),
    "Both HTML and plain text versions",
  );
  assert.equal(
    (
      await request("/api/builder/shop-orders", "PATCH", {
        id: mailOrder.id,
        revision: mailOrderRevision,
        status: "done",
      })
    ).status,
    409,
    "Mail updates cannot erase newer notes",
  );
  assert.equal(
    (
      await request(
        "/api/builder/shop-orders",
        "POST",
        { id: mailOrder.id, target: "buyer" },
        client,
      )
    ).status,
    409,
    "Sent email cannot be resent accidentally",
  );
  smtp = await json(await request("/api/builder/smtp"));
  const { passwordConfigured: _p, ready: _r, ...restoreSmtp } = smtp;
  void _p;void _r;
  await json(
    await request("/api/builder/smtp", "PUT", {
      ...restoreSmtp,
      source: "disabled",
    }),
  );
  console.log(
    "PASS: SMTP rejection preserves order, HTML/plain-text email, private-note exclusion, concurrent retry lock, sent-email protection and note history.",
  );
  await checkPayments({request,json,checkout,product:simple,directory,base,client});
  const registry = await json(await request("/api/builder/sites"));
  const site = registry.sites.find((s) => s.id === "default");
  const html = await (
    await fetch(base + `/site/${site.key}/inventory-variants`)
  ).text();
  assert(
    html.includes("data-product-variation-picker"),
    "Public product page includes the variation picker",
  );
  assert(!html.includes("12 options"), "A catalog product never inherits the demo frame picker");
  assert(!html.includes("Two-year warranty"), "Untouched template warranty claims are not merchant product data");
  const csv = await (await request("/api/builder/catalog/export")).text();
  assert(
    csv.includes("variants") && csv.includes("INV-BLACK-M"),
    "Export preserves variation information",
  );
  console.log(
    "PASS: checkout retries, one reservation per attempt, changed-payload rejection, stale prices, delivery totals, settings conflicts and client scope; variations, independent SKUs/prices/photos, concurrent final-unit reservations, physical stock transitions, repeated cancellation, reopening, protected product edits and atomic failed checkout.",
  );
}
