import {
  paymentSettings,
  enabledPayments,
} from "@/lib/builder/payment-settings";
import { PAYMENT_METHODS } from "@/lib/builder/payments-shared";
import { resultPath } from "@/lib/builder/payments";
import { createHash } from "node:crypto";
import { readCommerceSettings } from "@/lib/builder/commerce-store";
import { z } from "zod";
import { after } from "next/server";
import { onShopOrder } from "@/lib/builder/crm/events";
import {
  assertSameOrigin,
  clientIp,
  errorResponse,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import { readSiteProject } from "@/lib/builder/products/public";
import { readRegistry } from "@/lib/builder/sites";
import { limitShopOrders, validateFormToken } from "@/lib/builder/submissions";
import {
  confirmToBuyer,
  createShopOrder,
  findCheckoutOrder,
  deliveryZones,
  notifyShop,
  priceLine,
  sendOrderMail,
  zonePrice,
} from "@/lib/builder/shop";
import { zoneForAddress } from "@/lib/builder/shop-zones";
import { lookupCompany } from "@/lib/builder/lv-register";
import { formMessage, uiText } from "@/lib/builder/i18n";
export const runtime = "nodejs";

// Public checkout of a shop website (no online payment). The browser sends only what was
// chosen (product, options, quantity, delivery zone); prices, delivery and totals are
// recomputed from the published pages. Protected like enquiry forms: signed page token,
// honeypot, per-visitor limit.
const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS).default("on_receipt"),
  requestId: z
    .string()
    .regex(/^[a-zA-Z0-9-]{16,80}$/)
    .optional(),
  site: z.string().min(1).max(40),
  pageId: z.string().min(1).max(100),
  token: z.string().max(1000),
  website: z.string().max(500).default(""),
  locale: z.string().max(10).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().max(40).optional(),
        variantId: z.string().max(60).optional(),
        expectedPrice: z.number().finite().min(0).max(100000000).optional(),
        pageId: z.string().min(1).max(100),
        sectionId: z.string().min(1).max(100),
        name: text(300).min(1),
        options: z.array(text(300)).max(20).default([]),
        qty: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
  customer: z.object({
    type: z.enum(["private", "company"]),
    name: text(160).min(1),
    phone: z.union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^\+?[\d\s().-]{6,40}$/),
    ]),
    email: z.union([z.literal(""), z.email().max(254)]),
    // Instant checkout popup: the company's registration number (11 digits, Latvia).
    reg: z.string().trim().max(100).optional(),
  }),
  delivery: z.object({
    method: z.enum(["pickup", "delivery"]),
    address: text(500).default(""),
    zone: text(200).default(""),
    flat: text(200).default(""),
    point: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      })
      .nullish(),
  }),
  comment: text(2000).default(""),
  consents: z.array(text(400)).max(5).default([]),
  notify: z.enum(["whatsapp", "telegram"]).optional(),
  // Sent by the instant checkout popup (no cart): the order is placed from the page the buyer is on.
  via: z.literal("popup").optional(),
});
async function publishedSite(siteId: string) {
  const site = (await readRegistry()).sites.find((s) => s.id === siteId);
  if (!site) throw new StoreError("Form unavailable.", 404);
  // Pages as visitors see them: product prices, options and pages come from the catalogue.
  return readSiteProject(siteId, site.key);
}
// Delivery zones of the website's delivery block (contact-v20), for the checkout's zone
// choice. Public data that is already shown on the delivery page.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const project = await publishedSite(url.searchParams.get("site") || "");
    const paymentConfig = await paymentSettings(
      url.searchParams.get("site") || "",
    );
    const found = deliveryZones(project, url.searchParams.get("locale") || "");
    return Response.json(
      {
        zones: (found?.zones || []).map((z) => ({
          name: z.name,
          price: Number.isNaN(z.price) ? null : z.price,
          from: Number.isNaN(z.from) ? null : z.from,
          priceText: z.priceText,
          term: z.term,
        })),
        freeText: found?.freeText || "",
        // For the instant checkout popup: towns per zone, the pickup point, the shop's name.
        places: found?.places || [],
        pickup: found?.pickup || null,
        shop: project.brand.name,
        settings: project.commerce,
        receiptEmailRequired:
          paymentConfig.provider === "yookassa" && paymentConfig.receipt,
        paymentMethods: enabledPayments(
          paymentConfig,
          project.commerce?.currency || "EUR",
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
function orderResponse(
  order: {
    id?: string;
    accessKey?: string;
    number: number;
    subtotal: number;
    delivery: { price?: number; zone?: string };
    total?: number;
    currency: string;
    locale: string;
  },
  site?: string,
) {
  return Response.json({
    ok: true,
    resultUrl:
      site && order.id && order.accessKey
        ? resultPath(site, { id: order.id, accessKey: order.accessKey })
        : undefined,
    number: order.number,
    subtotal: order.subtotal,
    delivery: order.delivery.price || 0,
    zone: order.delivery.zone || "",
    total: order.total ?? order.subtotal,
    currency: order.currency,
    message: uiText(order.locale).orderSent.replace(
      "{n}",
      String(order.number),
    ),
  });
}
export async function POST(request: Request) {
  let locale: string | undefined;
  try {
    assertSameOrigin(request);
    const raw = (await readJson(request, 60000)) as { locale?: unknown };
    locale = typeof raw?.locale === "string" ? raw.locale : undefined;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new StoreError("Check the form fields.");
    const input = parsed.data;
    if (input.website)
      return Response.json({ ok: true, message: "Thank you." });
    if (!validateFormToken(input.token, input.pageId, input.site))
      throw new StoreError("Please reload the page and try again.", 403);
    const { token: _token, requestId: _key, ...fingerprint } = input;
    void _token;
    void _key;
    const requestHash = createHash("sha256")
      .update(JSON.stringify(fingerprint))
      .digest("hex");
    if (input.requestId) {
      const previous = await findCheckoutOrder(
        input.site,
        input.requestId,
        requestHash,
      );
      if (previous) return orderResponse(previous, input.site);
    }
    const settings = await readCommerceSettings(input.site);
    if (settings.checkout.phoneRequired && !input.customer.phone)
      throw new StoreError("Enter your phone number.");
    if (settings.checkout.emailRequired && !input.customer.email)
      throw new StoreError("Enter your email address.");
    if (input.notify && !settings.checkout.statusMessages)
      throw new StoreError("Order status messages are not enabled.");
    if (!settings.checkout.companies && input.customer.type === "company")
      throw new StoreError("Company purchases are not enabled.");
    if (
      (input.delivery.method === "pickup" && !settings.delivery.pickup) ||
      (input.delivery.method === "delivery" && !settings.delivery.shipping)
    )
      throw new StoreError("Choose an available delivery method.");
    if (input.delivery.method === "delivery" && !input.delivery.address)
      throw new StoreError("Please fill in all required fields.");
    const project = await publishedSite(input.site);
    // The order is placed from a published checkout page (pricing-v24) of this website, or — on a
    // website with the instant checkout popup — from the published page the order button is on.
    const popup = input.via === "popup";
    if (popup && project.store?.checkout !== "popup")
      throw new StoreError("Form unavailable.", 404);
    const checkout = project.pages.find(
      (p) =>
        p.id === input.pageId &&
        !p.deletedAt &&
        !!p.published &&
        (popup ||
          p.published.sections.some(
            (s) => s.variant === "pricing-v24" && !s.hidden,
          )),
    );
    if (!checkout || project.forms?.enabled === false)
      throw new StoreError("Form unavailable.", 404);
    locale = checkout.published!.locale;
    if (popup && input.customer.type === "company" && !input.customer.reg)
      throw new StoreError("Please fill in all required fields.");
    await limitShopOrders(clientIp(request));
    const priced = input.items.map((line) => priceLine(project, line));
    if (
      input.items.some(
        (line, i) =>
          line.expectedPrice !== undefined &&
          Math.abs(line.expectedPrice - priced[i].item.unitPrice) > 0.009,
      )
    )
      throw new StoreError(
        "A price has changed. Refresh the product page before ordering.",
        409,
      );
    const currency = settings.revision
      ? settings.currency
      : { "€": "EUR", $: "USD", "£": "GBP", "₽": "RUB" }[priced[0].currency] ||
        priced[0].currency;
    if (priced.some((p) => p.currency !== priced[0].currency))
      throw new StoreError(
        "Products in different currencies cannot be ordered together.",
      );
    const paymentConfig = await paymentSettings(input.site);
    if (!enabledPayments(paymentConfig, currency).includes(input.paymentMethod))
      throw new StoreError("Choose an available payment method.");
    if (
      input.paymentMethod === "yookassa" &&
      paymentConfig.receipt &&
      !input.customer.email
    )
      throw new StoreError("Enter your email address for the receipt.");
    const items = priced.map((p) => p.item);
    const subtotal =
      Math.round(items.reduce((sum, i) => sum + i.total, 0) * 100) / 100;
    // Delivery price: the chosen zone of the delivery block, with its free-from threshold
    // applied to this order's products total (the same rule as the calculator on the page).
    // The popup does not choose a zone: it follows from the address (shop-zones.ts), decided here.
    let zone = "",
      price = 0;
    if (input.delivery.method === "delivery") {
      const found = deliveryZones(project, locale);
      const zones = found?.zones || [];
      if (zones.length) {
        const chosen =
          settings.revision && settings.delivery.mode === "flat"
            ? zones[0]
            : popup
              ? zones[
                  zoneForAddress(
                    input.delivery.address,
                    found!.places,
                    zones.length,
                    input.delivery.point,
                    found!.pickup.point,
                  ).zone
                ]
              : zones.find((z) => z.name === input.delivery.zone);
        if (!chosen)
          throw new StoreError("Please fill in all required fields.");
        zone = chosen.name;
        price = zonePrice(chosen, subtotal);
      }
    }
    // Company of the popup: name and address from the register of enterprises when it answers.
    let company: { reg: string; name: string; address: string } | undefined;
    if (popup && input.customer.type === "company" && input.customer.reg) {
      company = { reg: input.customer.reg, name: "", address: "" };
      if (
        settings.delivery.country === "LV" &&
        !/^\d{11}$/.test(input.customer.reg)
      )
        throw new StoreError("Check the registration number.");
      const found =
        settings.delivery.country === "LV"
          ? await lookupCompany(input.customer.reg).catch(() => null)
          : null;
      if (found && !found.found)
        throw new StoreError("Check the registration number.");
      if (found?.found) {
        if (!found.active)
          throw new StoreError("Check the registration number.");
        company = { reg: found.reg, name: found.name, address: found.address };
      }
    }
    const total = Math.round((subtotal + price) * 100) / 100;
    const created = await createShopOrder(input.site, {
      payment: {
        method: input.paymentMethod,
        status: "unpaid",
        ...(input.paymentMethod === "invoice"
          ? { instructions: paymentConfig.invoiceInstructions }
          : {}),
      },
      requestId: input.requestId,
      requestHash,
      locale,
      pageId: checkout.id,
      currency,
      items,
      subtotal,
      total,
      customer: {
        type: input.customer.type,
        name: input.customer.name,
        phone: input.customer.phone,
        email: input.customer.email,
        ...(company ? { company } : {}),
      },
      delivery:
        input.delivery.method === "delivery"
          ? {
              method: "delivery",
              address: input.delivery.address,
              ...(input.delivery.flat ? { flat: input.delivery.flat } : {}),
              ...(input.delivery.point ? { point: input.delivery.point } : {}),
              zone,
              price,
            }
          : { method: "pickup", address: "" },
      comment: input.comment,
      consents: input.consents,
      ...(input.notify ? { notify: input.notify } : {}),
      ...(popup ? { via: "popup" as const } : {}),
    });
    if (!created.created) return orderResponse(created.order, input.site);
    const order = created.order;
    // CRM: contact, in-app and Telegram notification, after the response.
    after(() => onShopOrder(input.site, order));
    await sendOrderMail(input.site, order.id, "shop", (current) =>
      notifyShop(
        input.site,
        current,
        settings.notifications.recipient || project.forms?.recipient || "",
        project.brand.name,
      ),
    ).catch(() => {});
    if (settings.notifications.buyerConfirmation)
      await sendOrderMail(input.site, order.id, "buyer", (current) =>
        confirmToBuyer(input.site, current, project.brand.name, {
          email: project.website?.contactEmail,
          phone: project.website?.phone,
        }),
      ).catch(() => {});
    return Response.json({
      ok: true,
      resultUrl: resultPath(input.site, order),
      number: order.number,
      subtotal,
      delivery: price,
      zone,
      total,
      currency,
      message: uiText(locale).orderSent.replace("{n}", String(order.number)),
    });
  } catch (error) {
    const response = errorResponse(error);
    if (!locale) return response;
    const body = (await response.json()) as { error: string };
    return Response.json(
      { error: formMessage(locale, body.error) },
      { status: response.status },
    );
  }
}
