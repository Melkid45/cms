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
  deliveryZones,
  notifyShop,
  priceLine,
  updateShopOrder,
  zonePrice,
} from "@/lib/builder/shop";
import { formMessage, uiText } from "@/lib/builder/i18n";
export const runtime = "nodejs";

// Public checkout of a shop website (no online payment). The browser sends only what was
// chosen (product, options, quantity, delivery zone); prices, delivery and totals are
// recomputed from the published pages. Protected like enquiry forms: signed page token,
// honeypot, per-visitor limit.
const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  site: z.string().min(1).max(40),
  pageId: z.string().min(1).max(100),
  token: z.string().max(1000),
  website: z.string().max(500).default(""),
  locale: z.string().max(10).optional(),
  items: z
    .array(
      z.object({
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
    phone: z.string().trim().regex(/^\+?[\d\s().-]{6,40}$/),
    email: z.union([z.literal(""), z.email().max(254)]),
  }),
  delivery: z.object({
    method: z.enum(["pickup", "delivery"]),
    address: text(500).default(""),
    zone: text(200).default(""),
  }),
  comment: text(2000).default(""),
  consents: z.array(text(300)).max(5).default([]),
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
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
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
    if (input.delivery.method === "delivery" && !input.delivery.address)
      throw new StoreError("Please fill in all required fields.");
    const project = await publishedSite(input.site);
    // The order is placed from a published checkout page (pricing-v24) of this website.
    const checkout = project.pages.find(
      (p) =>
        p.id === input.pageId &&
        !p.deletedAt &&
        p.published?.sections.some((s) => s.variant === "pricing-v24" && !s.hidden),
    );
    if (!checkout || project.forms?.enabled === false)
      throw new StoreError("Form unavailable.", 404);
    locale = checkout.published!.locale;
    await limitShopOrders(clientIp(request));
    const priced = input.items.map((line) => priceLine(project, line));
    const currency = priced[0].currency;
    const items = priced.map((p) => p.item);
    const subtotal =
      Math.round(items.reduce((sum, i) => sum + i.total, 0) * 100) / 100;
    // Delivery price: the chosen zone of the delivery block, with its free-from threshold
    // applied to this order's products total (the same rule as the calculator on the page).
    let zone = "",
      price = 0;
    if (input.delivery.method === "delivery") {
      const zones = deliveryZones(project, locale)?.zones || [];
      if (zones.length) {
        const chosen = zones.find((z) => z.name === input.delivery.zone);
        if (!chosen) throw new StoreError("Please fill in all required fields.");
        zone = chosen.name;
        price = zonePrice(chosen, subtotal);
      }
    }
    const total = Math.round((subtotal + price) * 100) / 100;
    const order = await createShopOrder(input.site, {
      locale,
      pageId: checkout.id,
      currency,
      items,
      subtotal,
      total,
      customer: input.customer,
      delivery:
        input.delivery.method === "delivery"
          ? { method: "delivery", address: input.delivery.address, zone, price }
          : { method: "pickup", address: "" },
      comment: input.comment,
      consents: input.consents,
    });
    // CRM: contact, in-app and Telegram notification, after the response.
    after(() => onShopOrder(input.site, order));
    const email = await notifyShop(
      input.site,
      order,
      project.forms?.recipient || "",
      project.brand.name,
    );
    const buyerEmail = await confirmToBuyer(input.site, order, project.brand.name, {
      email: project.website?.contactEmail,
      phone: project.website?.phone,
    });
    if (email !== "none" || buyerEmail !== "none")
      await updateShopOrder(input.site, order.id, {
        revision: 0,
        email,
        buyerEmail,
      }).catch(() => {});
    return Response.json({
      ok: true,
      number: order.number,
      subtotal,
      delivery: price,
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
