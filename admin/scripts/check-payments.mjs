import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
export async function checkPayments({
  request,
  json,
  checkout,
  product,
  directory,
  base,
  client,
}) {
  let config = await json(await request("/api/builder/payments"));
  assert(!JSON.stringify(config).includes("sk_test_mock"));
  config = await json(
    await request(
      "/api/builder/payments",
      "PUT",
      {
        ...strip(config),
        invoice: true,
        invoiceInstructions: "Bank transfer · reference your order number",
      },
      client,
    ),
  );
  const invoice = await json(
    await checkout(product, undefined, 1, { paymentMethod: "invoice" }),
  );
  assert(invoice.resultUrl);
  let result = await fetch(base + invoice.resultUrl);
  assert.equal(result.status, 200);

  const resultHtml = await result.text();
  assert.match(resultHtml, /Bank transfer · reference/);
  assert.match(
    resultHtml,
    /name="referrer" content="strict-origin"/,
    "Payment forms retain a valid origin without leaking order tokens",
  );
  const invalid = new URL(invoice.resultUrl, base);
  invalid.searchParams.set("token", "0".repeat(64));
  assert.equal((await fetch(invalid)).status, 404);
  const unchanged = await json(await request("/api/builder/shop-orders"));
  const invoiceOrder = unchanged.find((o) => o.number === invoice.number);
  const paid = await json(
    await request(
      "/api/builder/shop-orders",
      "PATCH",
      {
        id: invoiceOrder.id,
        revision: invoiceOrder.revision,
        paymentStatus: "paid",
      },
      client,
    ),
  );
  assert.equal(paid.payment.status, "paid");
  assert.equal(paid.status, "new", "Payment and fulfillment are independent");
  config = await json(
    await request("/api/builder/payments", "PUT", {
      ...strip(config),
      provider: "stripe",
      baseUrl: "https://shop.example.test",
      stripeKey: "sk_test_mock",
      stripeWebhook: "whsec_test_mock",
    }),
  );
  assert.equal(config.stripeKey, "");
  assert.equal(config.stripeWebhook, "");
  assert(
    !(await readFile(`${directory}/payments-default.json`, "utf8")).includes(
      "sk_test_mock",
    ),
    "Provider secrets are encrypted",
  );
  assert.equal(
    (
      await request("/api/builder/payments", "PUT", {
        ...strip(config),
        revision: 0,
      })
    ).status,
    409,
  );
  const mockFile = `${directory}/payment-provider-test.json`;
  await writeFile(mockFile, JSON.stringify({}));
  const stripe = await json(
    await checkout(product, undefined, 1, { paymentMethod: "stripe" }),
  );
  const q = new URL(stripe.resultUrl, base).searchParams;
  const body = {
    site: "default",
    order: q.get("order"),
    token: q.get("token"),
  };
  const nullOrigin = await fetch(base + "/api/shop/payment", {
    method: "POST",
    headers: { Origin: "null", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(nullOrigin.status, 403, "Opaque origins are rejected cleanly");
  const formPayment = await fetch(base + "/api/shop/payment", {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: base,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  assert.equal(
    formPayment.status,
    303,
    "The actual result-page payment form redirects to the provider",
  );
  assert.match(formPayment.headers.get("location"), /checkout.stripe.com/);
  const session = await json(await request("/api/shop/payment", "POST", body));
  assert.match(session.url, /checkout.stripe.com/);
  const mock = JSON.parse(await readFile(mockFile, "utf8"));
  assert.equal(mock.remote.amount_total, 10000);
  assert.equal(mock.remote.currency, "eur");
  assert.equal((await request("/api/shop/payment", "POST", body)).status, 200);
  assert.equal(
    JSON.parse(await readFile(mockFile, "utf8")).requests.filter(
      (r) => r.method === "POST",
    ).length,
    1,
    "Refresh reuses the payment session",
  );
  let online = (await json(await request("/api/builder/shop-orders"))).find(
    (o) => o.number === stripe.number,
  );
  assert.equal(
    (
      await request(
        "/api/builder/shop-orders",
        "PATCH",
        { id: online.id, revision: online.revision, paymentStatus: "paid" },
        client,
      )
    ).status,
    403,
    "Online payment cannot be marked paid manually",
  );
  const event = JSON.stringify({
    type: "checkout.session.completed",
    data: { object: mock.remote },
  });
  const hook = async (signature, raw = event) =>
    fetch(base + "/api/shop/payments/stripe?site=default", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: raw,
    });
  assert.equal((await hook("invalid")).status, 400);
  const ts = Math.floor(Date.now() / 1000),
    signature =
      "t=" +
      ts +
      ",v1=" +
      createHmac("sha256", "whsec_test_mock")
        .update(`${ts}.${event}`)
        .digest("hex");
  await writeFile(
    mockFile,
    JSON.stringify({
      ...mock,
      override: { payment_status: "paid", amount_total: 1 },
    }),
  );
  assert.equal(
    (await hook(signature)).status,
    409,
    "Amount mismatch never marks paid",
  );
  await writeFile(
    mockFile,
    JSON.stringify({ ...mock, override: { payment_status: "paid" } }),
  );
  assert.equal((await hook(signature)).status, 200);
  assert.equal((await hook(signature)).status, 200);
  online = (await json(await request("/api/builder/shop-orders"))).find(
    (o) => o.number === stripe.number,
  );
  assert.equal(online.payment.status, "paid");
  assert.equal(online.status, "new");
  result = await fetch(base + stripe.resultUrl);
  assert.match(await result.text(), /Payment received/);
  // An expired provider session releases the last reserved unit.
  const project = await json(await request("/api/builder"));
  const page = structuredClone(
    project.pages.find((p) => p.id === "inventory-simple"),
  );
  page.id = "payment-expiry";
  page.slug = "payment-expiry";
  page.title = "Payment expiry";
  page.published = undefined;
  page.sections[0].id = "payment-expiry-block";
  project.pages.push(page);
  await json(
    await request("/api/builder?publish=payment-expiry", "PUT", project),
  );
  const limited = await json(
    await request("/api/builder/catalog", "POST", {
      sku: "PAYMENT-EXPIRY",
      price: 100,
      qty: 1,
      text: { en: { name: "Payment expiry", slug: "payment-expiry" } },
      pages: { en: "payment-expiry" },
    }),
  );
  await writeFile(mockFile, JSON.stringify({}));
  const expired = await json(
    await checkout(limited, undefined, 1, { paymentMethod: "stripe" }),
  );
  const eq = new URL(expired.resultUrl, base).searchParams;
  await json(
    await request("/api/shop/payment", "POST", {
      site: "default",
      order: eq.get("order"),
      token: eq.get("token"),
    }),
  );
  let expOrder = (await json(await request("/api/builder/shop-orders"))).find(
    (o) => o.number === expired.number,
  );
  assert.equal(
    (
      await request("/api/builder/shop-orders", "PATCH", {
        id: expOrder.id,
        revision: expOrder.revision,
        status: "cancelled",
      })
    ).status,
    409,
    "Pending online payment must not silently release stock",
  );
  const emock = JSON.parse(await readFile(mockFile, "utf8"));
  await writeFile(
    mockFile,
    JSON.stringify({ ...emock, override: { status: "expired" } }),
  );
  const eraw = JSON.stringify({
    type: "checkout.session.expired",
    data: { object: emock.remote },
  });
  const et = Math.floor(Date.now() / 1000);
  const esig =
    "t=" +
    et +
    ",v1=" +
    createHmac("sha256", "whsec_test_mock")
      .update(`${et}.${eraw}`)
      .digest("hex");
  assert.equal((await hook(esig, eraw)).status, 200);
  expOrder = (await json(await request("/api/builder/shop-orders"))).find(
    (o) => o.number === expired.number,
  );
  assert.equal(expOrder.status, "cancelled");
  assert.equal(expOrder.payment.status, "cancelled");
  const catalog = await json(await request("/api/builder/catalog"));
  assert.equal(
    catalog.catalog.products.find((p) => p.id === limited.id).reserved,
    0,
  );
  // Switch the shop to RUB and verify YooKassa independently.
  let commerce = await json(await request("/api/builder/shop-settings"));
  await json(
    await request("/api/builder/shop-settings", "PUT", {
      ...commerce,
      currency: "RUB",
    }),
  );
  config = await json(
    await request("/api/builder/payments", "PUT", {
      ...strip(config),
      provider: "yookassa",
      shopId: "123456",
      yooKey: "test_yoo_secret",
      receipt: true,
    }),
  );
  await writeFile(mockFile, JSON.stringify({}));
  const yoo = await json(
    await checkout(product, undefined, 1, {
      paymentMethod: "yookassa",
      customer: {
        type: "private",
        name: "Test buyer",
        phone: "+44123456789",
        email: "buyer@example.test",
      },
    }),
  );
  const yq = new URL(yoo.resultUrl, base).searchParams;
  await json(
    await request("/api/shop/payment", "POST", {
      site: "default",
      order: yq.get("order"),
      token: yq.get("token"),
    }),
  );
  const ymock = JSON.parse(await readFile(mockFile, "utf8"));
  const sent = JSON.parse(ymock.requests[0].body);
  assert.equal(sent.amount.currency, "RUB");
  assert.equal(sent.receipt.customer.email, "buyer@example.test");
  await writeFile(
    mockFile,
    JSON.stringify({ ...ymock, override: { status: "succeeded", paid: true } }),
  );
  const yevent = { object: ymock.remote, event: "payment.succeeded" };
  assert.equal(
    (await request("/api/shop/payments/yookassa?site=default", "POST", yevent))
      .status,
    200,
  );
  const yooOrder = (await json(await request("/api/builder/shop-orders"))).find(
    (o) => o.number === yoo.number,
  );
  assert.equal(yooOrder.payment.status, "paid");
  await json(
    await request("/api/builder/payments", "PUT", {
      ...strip(config),
      provider: "none",
      invoice: false,
    }),
  );
  commerce = await json(await request("/api/builder/shop-settings"));
  await json(
    await request("/api/builder/shop-settings", "PUT", {
      ...commerce,
      currency: "EUR",
    }),
  );
  console.log(
    "PASS: invoice/on-receipt separation, private result URLs, Stripe/YooKassa sessions, encrypted keys, session reuse, signed Stripe notifications, provider amount verification, receipts and webhook replay.",
  );
}
function strip(s) {
  const { stripeConfigured, webhookConfigured, yooConfigured, ...rest } = s;
  void stripeConfigured;
  void webhookConfigured;
  void yooConfigured;
  return rest;
}
