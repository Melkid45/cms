import "server-only";
import { randomUUID } from "node:crypto";
import { withDoc } from "./doc-store";
import { definition } from "./catalog";
import { collectionItems } from "./collections";
import { mailConnection } from "./smtp";
import { StoreError } from "./server";
import { uiText } from "./i18n";
import { catalogProductNamed, catalogProductOf } from "./products/apply";
import { parsePlaces } from "./shop-zones";
import type { Project, Section, TemplateNode } from "./types";

// Shop orders without online payment (Zcena): the visitor's cart is priced again here from
// the published page content (product cards, product page, configurator), never from the
// browser's totals. Orders live in one document per website: `shop-orders:{siteId}`.

export const SHOP_STATUSES = [
  "new",
  "confirmed",
  "shipped",
  "done",
  "cancelled",
] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];
export interface ShopOrderItem {
  pageId: string;
  pageTitle: string;
  sectionId: string;
  kind: "card" | "product" | "configurator";
  name: string;
  options: string[];
  qty: number;
  unitPrice: number;
  total: number;
}
export interface ShopOrder {
  id: string;
  number: number;
  createdAt: string;
  updatedAt: string;
  revision: number;
  status: ShopStatus;
  locale: string;
  pageId: string;
  currency: string;
  items: ShopOrderItem[];
  subtotal: number;
  customer: {
    type: "private" | "company";
    name: string;
    phone: string;
    email: string;
    // Company buyer (instant checkout popup): registration number, and the name and address
    // found in the register of enterprises (empty when the register could not be asked).
    company?: { reg: string; name: string; address: string };
  };
  delivery: {
    method: "pickup" | "delivery";
    address: string;
    // Flat / entrance / note for the courier (instant checkout popup).
    flat?: string;
    // Coordinates of the address (address register suggestion or the buyer's location).
    point?: { lat: number; lon: number };
    // Zone of the website's delivery block (contact-v20) and its price for this order.
    zone?: string;
    price?: number;
  };
  // Order status messages: the buyer asked for WhatsApp or Telegram (consent text in consents).
  notify?: "whatsapp" | "telegram";
  // Placed through the instant checkout popup (no cart) rather than the checkout page.
  via?: "popup";
  // subtotal (products) + delivery price.
  total?: number;
  // Confirmation e-mail to the buyer.
  buyerEmail?: "none" | "sent" | "failed";
  comment: string;
  consents: string[];
  email: "none" | "sent" | "failed";
  note: string;
  history: { at: string; status: ShopStatus }[];
}
type OrdersDoc = { next: number; items: ShopOrder[] };
const docId = (siteId: string) => `shop-orders:${siteId}`;
const empty = (): OrdersDoc => ({ next: 1001, items: [] });

// ---------------------------------------------------------------- page content as a plain tree
interface PlainNode {
  tag: string;
  cls: string;
  attrs: Record<string, string>;
  text: string;
  children: PlainNode[];
}
// Mirrors SectionRenderer: repeated cards, field values and template defaults.
function plainTree(section: Section): PlainNode[] {
  const entry = definition(section.variant);
  if (!entry) return [];
  const fieldValue = (values: Record<string, string>, key: string) =>
    values[key] ?? entry.fields.find((f) => f.key === key)?.value ?? "";
  const walk = (
    node: TemplateNode,
    values: Record<string, string>,
  ): PlainNode[] => {
    if (node.repeat) {
      const group = entry.repeaters?.find((r) => r.id === node.repeat);
      if (!group) return [];
      return collectionItems(section, entry, group).flatMap((item) => {
        const template = group.items[item.template];
        return template
          ? walk(template.node, { ...section.values, ...item.values })
          : [];
      });
    }
    if (node.text !== undefined)
      return [{ tag: "#text", cls: "", attrs: {}, text: node.text, children: [] }];
    if (!node.tag)
      return node.field
        ? [
            {
              tag: "#text",
              cls: "",
              attrs: {},
              text: fieldValue(values, node.field),
              children: [],
            },
          ]
        : [];
    const attrs = { ...node.attrs };
    for (const [name, key] of Object.entries(node.bindings || {}))
      attrs[name] = fieldValue(values, key);
    return [
      {
        tag: node.tag,
        cls: ` ${attrs.class || ""} `,
        attrs,
        text: node.field ? fieldValue(values, node.field) : "",
        children: node.field
          ? []
          : (node.children || []).flatMap((child) => walk(child, values)),
      },
    ];
  };
  return entry.nodes.flatMap((node) => walk(node, section.values));
}
const all = (nodes: PlainNode[], test: (n: PlainNode) => boolean): PlainNode[] =>
  nodes.flatMap((n) => [...(test(n) ? [n] : []), ...all(n.children, test)]);
const first = (nodes: PlainNode[], test: (n: PlainNode) => boolean) =>
  all(nodes, test)[0];
const byClass = (name: string) => (n: PlainNode) => n.cls.includes(` ${name} `);
const byAttr = (name: string) => (n: PlainNode) => name in n.attrs;
// Text with line breaks kept (multi-line fields: places list, opening hours).
const rawText = (n?: PlainNode): string =>
  n ? n.text + n.children.map(rawText).join("") : "";
const text = (n?: PlainNode): string =>
  n ? (n.text + n.children.map(text).join("")).replace(/\s+/g, " ").trim() : "";
// Same reading of prices as the site script: "€1,250", "1 499 €", "+150 €", "Included" (= NaN).
export function priceNumber(value: string) {
  const m = value
    .replace(/[\s ]/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : NaN;
}
const currencyOf = (value: string) =>
  value.match(/[€$£]|EUR|USD|GBP/)?.[0] || "€";

// ---------------------------------------------------------------- pricing
export interface CartLine {
  pageId: string;
  sectionId: string;
  name: string;
  options: string[];
  qty: number;
}
export function priceLine(project: Project, line: CartLine) {
  const page = project.pages.find(
    (p) => p.id === line.pageId && !p.deletedAt && p.published,
  );
  const section = page?.published!.sections.find(
    (s) => s.id === line.sectionId && !s.hidden,
  );
  if (!page || !section)
    throw new StoreError("A product in your cart is no longer available.");
  const tree = plainTree(section);
  const fail = () => {
    throw new StoreError(`"${line.name}" is no longer available. Please update your cart.`);
  };
  const want = line.name.trim();
  let kind: ShopOrderItem["kind"], name: string, unit: number, priceText: string;
  let options: string[] = [];
  if (first(tree, byAttr("data-configurator"))) {
    kind = "configurator";
    const steps = all(tree, byClass("pricing__cfg-step"));
    const base = text(first(tree, byClass("pricing__cfg-base-price")));
    unit = priceNumber(base);
    if (Number.isNaN(unit)) unit = 0;
    priceText = base;
    const chosen = steps.map((step, i) => {
      const choices = all(step.children, byClass("pricing__cfg-option")).map((o) => ({
        name: text(first(o.children, byClass("pricing__cfg-option-name"))),
        price: text(first(o.children, byClass("pricing__cfg-option-price"))),
      }));
      const label = text(first(step.children, byClass("pricing__cfg-label"))
        ?.children.find((c) => c.tag !== "#text" && !c.cls.includes("pricing__cfg-value")));
      const current = text(first(step.children, byClass("pricing__cfg-value")));
      const pick =
        choices.find((c) => c.name === (line.options[i] ?? current)) ?? fail();
      const n = priceNumber(pick.price);
      if (!Number.isNaN(n)) unit += n;
      priceText ||= pick.price;
      return { label, value: pick.name };
    });
    if (!chosen.length) fail();
    name = chosen[0].value;
    options = chosen.slice(1).map((c) => (c.label ? `${c.label}: ${c.value}` : c.value));
  } else if (first(tree, byAttr("data-product"))) {
    kind = "product";
    const info = first(tree, byClass("pricing__pd-info"));
    name = text(first(info ? [info] : tree, (n) => /^h[1-6]$/.test(n.tag)));
    priceText = text(first(tree, byAttr("data-product-price")));
    unit = priceNumber(priceText);
    const groups = all(tree, byAttr("data-choice-group"));
    options = groups.map((group, i) => {
      const label = text(first(group.children, byClass("pricing__pd-label")));
      const choices = all(group.children, byClass("pricing__pd-choice")).map((c) => ({
        active: c.cls.includes(" is-active "),
        name: text(c.children.find((x) => x.tag !== "#text" && !x.cls.includes("pricing__pd-delta"))),
        delta: text(first(c.children, byClass("pricing__pd-delta"))),
      }));
      const pick =
        choices.find((c) => c.name === line.options[i]) ??
        (line.options[i] === undefined ? choices.find((c) => c.active) ?? choices[0] : undefined) ??
        fail();
      const n = priceNumber(pick.delta);
      if (!Number.isNaN(n)) unit += n;
      // Groups left empty in the editor are hidden on the page: no option to show.
      return !pick.name ? "" : label ? `${label}: ${pick.name}` : pick.name;
    }).filter(Boolean);
    // A choice from an option picker pop-up (pricing-v25) linked from the pick row ("#case"): the extra option
    // after the groups, priced from that pop-up's published cards on the same page.
    const picked = line.options[groups.length];
    const pickRow = first(tree, byClass("pricing__pd-pick"));
    const target = pickRow?.attrs.href?.startsWith("#") ? pickRow.attrs.href.slice(1) : "";
    if (picked && target) {
      const picker = page.published!.sections
        .filter((s) => !s.hidden)
        .map(plainTree)
        .find((t) => first(t, (n) => n.attrs["data-modal"] === target && "data-option-picker" in n.attrs));
      const card = picker && all(picker, byClass("pricing__picker-choice"))
        .find((c) => text(first(c.children, byClass("pricing__picker-name"))) === picked);
      if (!card) fail();
      const n = priceNumber(text(first(card!.children, byClass("pricing__picker-delta"))));
      if (!Number.isNaN(n)) unit += n;
      const label = text(first(first(tree, (x) => x.children.includes(pickRow!))?.children || [], byClass("pricing__pd-label"))?.children[0]);
      options.push(label ? `${label}: ${picked}` : picked);
    }
  } else {
    kind = "card";
    const card = all(tree, (n) => n.tag === "article" && n.cls.includes(" pricing__shop-card "))
      .find((c) => text(first(c.children, byClass("pricing__shop-title"))) === want);
    if (!card) fail();
    name = want;
    priceText = text(first(first(card!.children, byClass("pricing__shop-price"))?.children || [], byClass("heading")));
    unit = priceNumber(priceText);
  }
  if (!name || Number.isNaN(unit) || unit < 0) fail();
  if (kind !== "configurator" && name !== want) fail();
  // Catalogue products (products/apply.ts): the price above already comes from the catalogue;
  // a product marked out of stock cannot be ordered.
  if (kind !== "configurator") {
    const product =
      (kind === "product" && catalogProductOf(project, page.id)) ||
      catalogProductNamed(project, page.published!.locale, name);
    if (product?.stock === "out_of_stock") fail();
  }
  return {
    item: {
      pageId: page.id,
      pageTitle: page.published!.title,
      sectionId: section.id,
      kind,
      name,
      options,
      qty: line.qty,
      unitPrice: Math.round(unit * 100) / 100,
      total: Math.round(unit * line.qty * 100) / 100,
    } satisfies ShopOrderItem,
    currency: currencyOf(priceText),
  };
}

// ---------------------------------------------------------------- delivery zones (contact-v20)
export interface DeliveryZone {
  name: string;
  price: number; // NaN = always free ("Free")
  from: number; // NaN = no free-delivery threshold
  priceText: string;
  term: string;
}
// Zones of the published delivery calculator, preferably on a page in this language.
// Same reading as the calculator on the page: a zone is free when its price is not a number
// or when the order total reaches its "free from …" figure.
export function deliveryZones(project: Project, locale: string) {
  const pages = project.pages
    .filter((p) => !p.deletedAt && p.published)
    .sort((a, b) => Number(b.published!.locale === locale) - Number(a.published!.locale === locale));
  for (const page of pages)
    for (const section of page.published!.sections) {
      if (section.hidden) continue;
      const tree = plainTree(section);
      const root = first(tree, byAttr("data-dlv-calc"));
      if (!root) continue;
      const zones = all(root.children, byClass("contact__zone"))
        .map((z) => {
          const priceText = text(first(z.children, byClass("contact__zone-price")));
          return {
            name: text(first(z.children, byClass("contact__zone-name"))),
            price: priceNumber(priceText),
            from: priceNumber(text(first(z.children, byClass("contact__zone-note")))),
            priceText,
            term: text(first(z.children, byClass("contact__zone-term"))),
          };
        })
        .filter((z) => z.name);
      if (!zones.length) continue;
      // Pickup point of the same block: address, opening hours (one line each), note, map links.
      const body = first(tree, byClass("contact__pickup-body"));
      const paras = body ? all(body.children, (n) => n.tag === "p") : [];
      const links = body ? all(body.children, (n) => n.tag === "a" && !!n.attrs.href) : [];
      const google = links.find((a) => /google\./.test(a.attrs.href))?.attrs.href || "";
      const at = google.match(/destination=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      return {
        zones,
        freeText: text(first(root.children, byClass("contact__calc-free"))),
        places: parsePlaces(rawText(first(root.children, byAttr("data-dlv-places"))), zones.length),
        pickup: {
          address: text(paras[0]),
          hours: rawText(paras[1]).split("\n").map((l) => l.trim()).filter(Boolean),
          note: text(paras[2]),
          google,
          waze: links.find((a) => /waze\./.test(a.attrs.href))?.attrs.href || "",
          point: at ? { lat: Number(at[1]), lon: Number(at[2]) } : null,
        },
      };
    }
  return null;
}
export const zonePrice = (zone: DeliveryZone, subtotal: number) =>
  Number.isNaN(zone.price) || (!Number.isNaN(zone.from) && subtotal >= zone.from)
    ? 0
    : Math.round(zone.price * 100) / 100;

// ---------------------------------------------------------------- storage
export const listShopOrders = (siteId: string) =>
  withDoc(docId(siteId), empty, (data) => data.items, false);
export async function createShopOrder(
  siteId: string,
  input: Omit<ShopOrder, "id" | "number" | "createdAt" | "updatedAt" | "revision" | "status" | "email" | "note" | "history">,
) {
  const now = new Date().toISOString();
  return withDoc(docId(siteId), empty, (data) => {
    if (data.items.length >= 5000)
      throw new StoreError("The shop cannot take new orders right now. Please call us.", 503);
    const order: ShopOrder = {
      ...input,
      id: randomUUID(),
      number: data.next++,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      status: "new",
      email: "none",
      note: "",
      history: [{ at: now, status: "new" }],
    };
    data.items.unshift(order);
    return order;
  });
}
export const updateShopOrder = (
  siteId: string,
  id: string,
  patch: {
    status?: ShopStatus;
    note?: string;
    revision: number;
    email?: ShopOrder["email"];
    buyerEmail?: ShopOrder["buyerEmail"];
  },
) =>
  withDoc(docId(siteId), empty, (data) => {
    const order = data.items.find((o) => o.id === id);
    if (!order) throw new StoreError("Order not found.", 404);
    if (patch.revision !== order.revision)
      throw new StoreError("This order was updated elsewhere. Refresh first.", 409);
    const now = new Date().toISOString();
    if (patch.status && patch.status !== order.status) {
      order.status = patch.status;
      order.history.push({ at: now, status: patch.status });
    }
    if (patch.note !== undefined) order.note = patch.note;
    if (patch.email) order.email = patch.email;
    if (patch.buyerEmail) order.buyerEmail = patch.buyerEmail;
    order.revision++;
    order.updatedAt = now;
    return order;
  });
export const deleteShopOrders = (siteId: string, ids: string[]) =>
  withDoc(docId(siteId), empty, (data) => {
    const before = data.items.length;
    data.items = data.items.filter((o) => !ids.includes(o.id));
    return { deleted: before - data.items.length };
  });

// ---------------------------------------------------------------- e-mail (existing SMTP path)
const money = (n: number, currency: string) =>
  `${n.toFixed(2).replace(/\.00$/, "")} ${currency}`;
export function orderText(order: ShopOrder) {
  return [
    `Order #${order.number} · ${order.createdAt.slice(0, 16).replace("T", " ")} UTC`,
    "",
    ...order.items.map(
      (i) =>
        `${i.qty} × ${i.name}${i.options.length ? ` (${i.options.join(", ")})` : ""} — ${money(i.total, order.currency)}`,
    ),
    "",
    `Products: ${money(order.subtotal, order.currency)}`,
    `Delivery: ${order.delivery.method === "pickup" ? "pickup" : `${order.delivery.zone ? `${order.delivery.zone}, ` : ""}${money(order.delivery.price ?? 0, order.currency)} — ${order.delivery.address}${order.delivery.flat ? `, ${order.delivery.flat}` : ""}`}`,
    `Total: ${money(order.total ?? order.subtotal, order.currency)} (payment on delivery or pickup)`,
    "",
    order.customer.company
      ? `Company: ${order.customer.company.name || "(not checked in the register)"}, reg. No. ${order.customer.company.reg}${order.customer.company.address ? `, ${order.customer.company.address}` : ""}`
      : "",
    `${order.customer.company ? "Contact person" : order.customer.type === "company" ? "Company" : "Customer"}: ${order.customer.name}`,
    `Phone: ${order.customer.phone}`,
    order.customer.email ? `E-mail: ${order.customer.email}` : "",
    order.notify ? `Status messages: ${order.notify === "whatsapp" ? "WhatsApp" : "Telegram"}` : "",
    order.comment ? `\nComment: ${order.comment}` : "",
  ]
    .filter((line, i, a) => line !== "" || a[i - 1] !== "")
    .join("\n");
}
// Notifies the shop (form recipient). Returns the delivery state stored on the order.
export async function notifyShop(
  siteId: string,
  order: ShopOrder,
  recipient: string,
  shopName: string,
): Promise<ShopOrder["email"]> {
  if (!recipient) return "none";
  let connection: Awaited<ReturnType<typeof mailConnection>> = null;
  try {
    connection = await mailConnection(siteId);
    if (!connection) return "none";
    await connection.transport.sendMail({
      from: connection.from,
      to: recipient,
      replyTo: order.customer.email || connection.replyTo || undefined,
      subject: `${shopName.replace(/[\r\n]/g, " ").slice(0, 80)}: order #${order.number}`,
      text: orderText(order),
    });
    return "sent";
  } catch {
    return "failed";
  } finally {
    connection?.transport.close();
  }
}

// Confirmation to the buyer in the page language (no-op without SMTP or a buyer e-mail).
export async function confirmToBuyer(
  siteId: string,
  order: ShopOrder,
  shopName: string,
  contact: { email?: string; phone?: string },
): Promise<NonNullable<ShopOrder["buyerEmail"]>> {
  if (!order.customer.email) return "none";
  const t = uiText(order.locale);
  let connection: Awaited<ReturnType<typeof mailConnection>> = null;
  try {
    connection = await mailConnection(siteId);
    if (!connection) return "none";
    const name = shopName.replace(/[\r\n]/g, " ").slice(0, 80);
    const delivery =
      order.delivery.method === "pickup"
        ? t.pickup
        : `${t.delivery}${order.delivery.zone ? ` (${order.delivery.zone})` : ""}: ${order.delivery.price ? money(order.delivery.price, order.currency) : t.free} — ${order.delivery.address}${order.delivery.flat ? `, ${order.delivery.flat}` : ""}`;
    await connection.transport.sendMail({
      from: connection.from,
      to: order.customer.email,
      replyTo: contact.email || connection.replyTo || undefined,
      subject: `${name}: ${t.orderSubject.replace("{n}", String(order.number))}`,
      text: [
        t.orderIntro,
        "",
        ...order.items.map(
          (i) => `${i.qty} × ${i.name}${i.options.length ? ` (${i.options.join(", ")})` : ""} — ${money(i.total, order.currency)}`,
        ),
        "",
        `${t.subtotal}: ${money(order.subtotal, order.currency)}`,
        delivery,
        `${t.total}: ${money(order.total ?? order.subtotal, order.currency)}`,
        "",
        name,
        [contact.phone, contact.email].filter(Boolean).join(" · "),
      ].join("\n"),
    });
    return "sent";
  } catch {
    return "failed";
  } finally {
    connection?.transport.close();
  }
}
