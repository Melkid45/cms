import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { withShopOrders, settleOrderPayment, type ShopOrder } from "./shop";
import { paymentSettings, paymentSecret } from "./payment-settings";
import { StoreError } from "./server";
import type { OrderPayment } from "./payments-shared";
export function equalToken(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function accessibleOrder(site: string, id: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new StoreError("Order not found.", 404);
  return withShopOrders(
    site,
    (d) => {
      const o = d.items.find((o) => o.id === id);
      if (!o?.accessKey || !equalToken(o.accessKey, token))
        throw new StoreError("Order not found.", 404);
      return o;
    },
    false,
  );
}
export function resultPath(
  site: string,
  order: Pick<ShopOrder, "id" | "accessKey">,
) {
  return `/api/shop/result?site=${encodeURIComponent(site)}&order=${encodeURIComponent(order.id)}&token=${order.accessKey || ""}`;
}
async function providerFetch(url: string, init: RequestInit) {
  try {
    const r = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    const data = await r.json();
    if (!r.ok) throw new Error("Provider rejected request");
    return data;
  } catch {
    throw new StoreError(
      "Payment provider is unavailable. Your order is saved; please try again from the order page.",
      502,
    );
  }
}
function authYoo(shop: string, key: string) {
  return "Basic " + Buffer.from(`${shop}:${key}`).toString("base64");
}
export async function startPayment(site: string, id: string, token: string) {
  const original = await accessibleOrder(site, id, token);
  const settings = await paymentSettings(site);
  const method = original.payment?.method;
  if (method !== "stripe" && method !== "yookassa")
    throw new StoreError("This order uses offline payment.");
  if (settings.provider !== method)
    throw new StoreError(
      "This payment provider is no longer available. Contact the shop.",
    );
  if (
    original.status === "cancelled" ||
    original.payment?.status === "cancelled"
  )
    throw new StoreError(
      "This order is cancelled. Please place a new order.",
      409,
    );
  if (original.payment?.status === "paid")
    return { url: resultPath(site, original) };
  if (original.payment?.url) return { url: original.payment.url };
  if (!settings.baseUrl)
    throw new StoreError("Payment URL is not configured.", 503);
  const order = await withShopOrders(site, (d) => {
    const o = d.items.find((o) => o.id === id);
    if (!o) throw new StoreError("Order not found.", 404);
    if (
      o.status === "cancelled" ||
      o.payment?.status === "paid" ||
      o.payment?.status === "cancelled"
    )
      throw new StoreError(
        "Payment status changed. Refresh the order page.",
        409,
      );
    o.payment = {
      ...o.payment!,
      attempt: o.payment?.attempt || randomUUID(),
      createdAt: o.payment?.createdAt || new Date().toISOString(),
      status: "pending",
    };
    o.revision++;
    return structuredClone(o);
  });
  const returnUrl =
    settings.baseUrl.replace(/\/$/, "") + resultPath(site, order);
  const cents = Math.round((order.total ?? order.subtotal) * 100);
  if (cents <= 0)
    throw new StoreError("Online payments require a positive order total.");
  let remote: {
    id: string;
    url?: string;
    confirmation?: { confirmation_url?: string };
    livemode?: boolean;
    test?: boolean;
  };
  if (method === "stripe") {
    const body = new URLSearchParams({
      mode: "payment",
      success_url: returnUrl,
      cancel_url: returnUrl,
      expires_at: String(
        Math.floor(Date.parse(order.payment!.createdAt!) / 1000) + 1800,
      ),
      "metadata[site]": site,
      "metadata[order]": id,
      "metadata[attempt]": order.payment!.attempt!,
      "line_items[0][price_data][currency]": order.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(cents),
      "line_items[0][price_data][product_data][name]": `Order #${order.number}`,
      "line_items[0][quantity]": "1",
      "payment_method_types[0]": "card",
    });
    if (order.customer.email) body.set("customer_email", order.customer.email);
    remote = await providerFetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paymentSecret(settings, "stripeKey")}`,
          "Idempotency-Key": order.payment!.attempt!,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );
  } else {
    if (order.currency !== "RUB")
      throw new StoreError("YooKassa requires RUB for this integration.");
    if (settings.receipt && !order.customer.email)
      throw new StoreError("An email address is required for the receipt.");
    const receiptItems = [
      ...order.items
        .filter((i) => i.total > 0)
        .map((i) => ({
          description: i.name.slice(0, 128),
          quantity: String(i.qty),
          amount: { value: i.unitPrice.toFixed(2), currency: "RUB" },
          vat_code: settings.vatCode,
          payment_mode: "full_prepayment",
          payment_subject: "commodity",
        })),
      ...(order.delivery.price
        ? [
            {
              description: "Delivery",
              quantity: "1",
              amount: {
                value: order.delivery.price.toFixed(2),
                currency: "RUB",
              },
              vat_code: settings.vatCode,
              payment_mode: "full_prepayment",
              payment_subject: "service",
            },
          ]
        : []),
    ];
    remote = await providerFetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        Authorization: authYoo(
          settings.shopId,
          paymentSecret(settings, "yooKey"),
        ),
        "Idempotence-Key": order.payment!.attempt!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: { value: (cents / 100).toFixed(2), currency: "RUB" },
        capture: true,
        confirmation: { type: "redirect", return_url: returnUrl },
        description: `Order #${order.number}`,
        metadata: { site, order: id, attempt: order.payment!.attempt },
        ...(settings.receipt
          ? {
              receipt: {
                customer: { email: order.customer.email },
                items: receiptItems,
                ...(settings.taxSystem
                  ? { tax_system_code: settings.taxSystem }
                  : {}),
              },
            }
          : {}),
      }),
    });
  }
  const url = remote.url || remote.confirmation?.confirmation_url;
  if (!remote.id || !url || !/^https:\/\//.test(url))
    throw new StoreError("Could not open the payment page.", 502);
  await withShopOrders(site, (d) => {
    const o = d.items.find((o) => o.id === id);
    if (!o) throw new StoreError("Order not found.", 404);
    if (o.payment?.attempt !== order.payment?.attempt)
      throw new StoreError("Payment attempt changed.", 409);
    o.payment = {
      ...o.payment!,
      providerId: remote.id,
      url,
      test: method === "stripe" ? !remote.livemode : !!remote.test,
    };
    o.revision++;
  });
  return { url };
}
export function verifyStripeSignature(
  raw: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  const parts = signature.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return parts
    .filter((p) => p.startsWith("v1="))
    .some((p) => equalToken(expected, p.slice(3)));
}
export async function reconcilePayment(
  site: string,
  id: string,
  remoteId: string,
) {
  const order = await withShopOrders(
    site,
    (d) => d.items.find((o) => o.id === id),
    false,
  );
  if (!order?.payment) throw new StoreError("Order not found.", 404);
  const settings = await paymentSettings(site);
  const method = order.payment.method;
  let remote;
  let state: OrderPayment["status"] = "pending";
  let cents = 0;
  let currency = "";
  let test = false;
  if (method === "stripe") {
    if (!/^cs_[A-Za-z0-9_]+$/.test(remoteId))
      throw new StoreError("Invalid payment ID.");
    remote = await providerFetch(
      `https://api.stripe.com/v1/checkout/sessions/${remoteId}`,
      {
        headers: {
          Authorization: `Bearer ${paymentSecret(settings, "stripeKey")}`,
        },
      },
    );
    state =
      remote.payment_status === "paid"
        ? "paid"
        : remote.status === "expired"
          ? "cancelled"
          : "pending";
    cents = remote.amount_total;
    currency = String(remote.currency).toUpperCase();
    test = !remote.livemode;
  } else if (method === "yookassa") {
    if (!/^[a-zA-Z0-9-]{20,64}$/.test(remoteId))
      throw new StoreError("Invalid payment ID.");
    remote = await providerFetch(
      `https://api.yookassa.ru/v3/payments/${remoteId}`,
      {
        headers: {
          Authorization: authYoo(
            settings.shopId,
            paymentSecret(settings, "yooKey"),
          ),
        },
      },
    );
    state =
      remote.status === "succeeded" && remote.paid === true
        ? "paid"
        : remote.status === "canceled"
          ? "cancelled"
          : "pending";
    cents = Math.round(Number(remote.amount?.value) * 100);
    currency = remote.amount?.currency;
    test = !!remote.test;
  } else throw new StoreError("This order uses offline payment.");
  if (
    remote.id !== remoteId ||
    remote.metadata?.site !== site ||
    remote.metadata?.order !== id ||
    remote.metadata?.attempt !== order.payment.attempt ||
    cents !== Math.round((order.total ?? order.subtotal) * 100) ||
    currency !== order.currency ||
    (order.payment.providerId && order.payment.providerId !== remoteId)
  )
    throw new StoreError("Payment details do not match this order.", 409);
  return settleOrderPayment(site, id, {
    ...order.payment,
    providerId: remoteId,
    status: state,
    test,
    ...(state === "paid" ? { paidAt: new Date().toISOString() } : {}),
  });
}
