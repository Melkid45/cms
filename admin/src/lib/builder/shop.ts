import "server-only";
import { paymentLabels } from "./payments-shared";
import type { OrderPayment } from "./payments-shared";
import { randomUUID, randomBytes } from "node:crypto";
import { emptyCatalog, variantLabel, type Catalog } from "./products/shared";
import {
  reserveInventory,
  moveInventory,
  type Inventory,
} from "./products/inventory";
import { withDoc, withDocs } from "./doc-store";
import { definition } from "./catalog";
import { collectionItems } from "./collections";
import { mailConnection } from "./smtp";
import { StoreError } from "./server";
import { uiText, type Locale } from "./i18n";
import {
  catalogProductNamed,
  catalogProductOf,
  catalogProductById,
} from "./products/apply";
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
  productId?: string;
  variantId?: string;
  sku?: string;
  basePrice?: number;
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
  accessKey?: string;
  payment?: OrderPayment;
  requestId?: string;
  requestHash?: string;
  inventory?: Inventory;
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
  history: {
    at: string;
    status: ShopStatus;
    kind?: "status" | "note" | "payment";
    paymentStatus?: OrderPayment["status"];
    actor?: string;
  }[];
  mail?: Partial<
    Record<
      "shop" | "buyer",
      {
        state: "sending" | "sent" | "failed" | "none";
        at: string;
        attempt: string;
      }
    >
  >;
}
type Receipt = Pick<
  ShopOrder,
  "id" | "accessKey" | "number" | "subtotal" | "total" | "currency" | "locale"
> & {
  delivery: Pick<ShopOrder["delivery"], "price" | "zone">;
  requestId: string;
  requestHash: string;
  createdAt: string;
};
type OrdersDoc = { next: number; items: ShopOrder[]; receipts?: Receipt[] };
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
      return [
        { tag: "#text", cls: "", attrs: {}, text: node.text, children: [] },
      ];
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
const all = (
  nodes: PlainNode[],
  test: (n: PlainNode) => boolean,
): PlainNode[] =>
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
  productId?: string;
  variantId?: string;
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
  const boundProduct = line.productId
    ? catalogProductById(project, line.productId)
    : catalogProductOf(project, page.id) ||
      catalogProductNamed(project, page.published!.locale, line.name.trim());
  if (line.productId && line.productId !== boundProduct?.id)
    throw new StoreError("This product is no longer available.", 409);
  if (boundProduct?.variants?.length) {
    const variant = boundProduct.variants.find(
      (v) => v.id === line.variantId && !v.hidden,
    );
    if (!variant || boundProduct.hidden || variant.stock === "out_of_stock")
      throw new StoreError("Choose an available product variation.", 409);
    return {
      currency: project.commerce?.revision ? project.commerce.currency : "€",
      item: {
        pageId: page.id,
        pageTitle: page.published!.title,
        sectionId: section.id,
        kind: "product" as const,
        productId: boundProduct.id,
        variantId: variant.id,
        sku: variant.sku,
        name:
          boundProduct.text[page.published!.locale as Locale]?.name ||
          line.name.trim(),
        options: [variantLabel(variant)],
        qty: line.qty,
        basePrice: variant.price,
        unitPrice: variant.price,
        total: Math.round(variant.price * line.qty * 100) / 100,
      },
    };
  }
  if (line.variantId)
    throw new StoreError("This variation is no longer available.", 409);
  const tree = plainTree(section);
  const fail = () => {
    throw new StoreError(
      `"${line.name}" is no longer available. Please update your cart.`,
    );
  };
  const want = line.name.trim();
  let kind: ShopOrderItem["kind"],
    name: string,
    unit: number,
    priceText: string;
  let options: string[] = [];
  if (first(tree, byAttr("data-configurator"))) {
    kind = "configurator";
    const steps = all(tree, byClass("pricing__cfg-step"));
    const base = text(first(tree, byClass("pricing__cfg-base-price")));
    unit = priceNumber(base);
    if (Number.isNaN(unit)) unit = 0;
    priceText = base;
    const chosen = steps.map((step, i) => {
      const choices = all(step.children, byClass("pricing__cfg-option")).map(
        (o) => ({
          name: text(first(o.children, byClass("pricing__cfg-option-name"))),
          price: text(first(o.children, byClass("pricing__cfg-option-price"))),
        }),
      );
      const label = text(
        first(step.children, byClass("pricing__cfg-label"))?.children.find(
          (c) => c.tag !== "#text" && !c.cls.includes("pricing__cfg-value"),
        ),
      );
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
    options = chosen
      .slice(1)
      .map((c) => (c.label ? `${c.label}: ${c.value}` : c.value));
  } else if (first(tree, byAttr("data-product"))) {
    kind = "product";
    const info = first(tree, byClass("pricing__pd-info"));
    name = text(first(info ? [info] : tree, (n) => /^h[1-6]$/.test(n.tag)));
    priceText = text(first(tree, byAttr("data-product-price")));
    unit = priceNumber(priceText);
    const groups = all(tree, byAttr("data-choice-group"));
    options = groups
      .map((group, i) => {
        const label = text(first(group.children, byClass("pricing__pd-label")));
        const choices = all(group.children, byClass("pricing__pd-choice")).map(
          (c) => ({
            active: c.cls.includes(" is-active "),
            name: text(
              c.children.find(
                (x) =>
                  x.tag !== "#text" && !x.cls.includes("pricing__pd-delta"),
              ),
            ),
            delta: text(first(c.children, byClass("pricing__pd-delta"))),
          }),
        );
        const pick =
          choices.find((c) => c.name === line.options[i]) ??
          (line.options[i] === undefined
            ? (choices.find((c) => c.active) ?? choices[0])
            : undefined) ??
          fail();
        const n = priceNumber(pick.delta);
        if (!Number.isNaN(n)) unit += n;
        // Groups left empty in the editor are hidden on the page: no option to show.
        return !pick.name ? "" : label ? `${label}: ${pick.name}` : pick.name;
      })
      .filter(Boolean);
    // A choice from an option picker pop-up (pricing-v25) linked from the pick row ("#case"): the extra option
    // after the groups, priced from that pop-up's published cards on the same page.
    const picked = line.options[groups.length];
    const pickRow = first(tree, byClass("pricing__pd-pick"));
    const target = pickRow?.attrs.href?.startsWith("#")
      ? pickRow.attrs.href.slice(1)
      : "";
    if (picked && target) {
      const picker = page
        .published!.sections.filter((s) => !s.hidden)
        .map(plainTree)
        .find((t) =>
          first(
            t,
            (n) =>
              n.attrs["data-modal"] === target &&
              "data-option-picker" in n.attrs,
          ),
        );
      const card =
        picker &&
        all(picker, byClass("pricing__picker-choice")).find(
          (c) =>
            text(first(c.children, byClass("pricing__picker-name"))) === picked,
        );
      if (!card) fail();
      const n = priceNumber(
        text(first(card!.children, byClass("pricing__picker-delta"))),
      );
      if (!Number.isNaN(n)) unit += n;
      const label = text(
        first(
          first(tree, (x) => x.children.includes(pickRow!))?.children || [],
          byClass("pricing__pd-label"),
        )?.children[0],
      );
      options.push(label ? `${label}: ${picked}` : picked);
    }
  } else {
    kind = "card";
    const card = all(
      tree,
      (n) => n.tag === "article" && n.cls.includes(" pricing__shop-card "),
    ).find(
      (c) => text(first(c.children, byClass("pricing__shop-title"))) === want,
    );
    if (!card) fail();
    name = want;
    priceText = text(
      first(
        first(card!.children, byClass("pricing__shop-price"))?.children || [],
        byClass("heading"),
      ),
    );
    unit = priceNumber(priceText);
  }
  if (kind === "card" && boundProduct) unit = boundProduct.price;
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
      ...(boundProduct
        ? {
            productId: boundProduct.id,
            sku: boundProduct.sku,
            basePrice: boundProduct.price,
          }
        : {}),
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
    currency: project.commerce?.revision
      ? project.commerce.currency
      : currencyOf(priceText),
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
  const config = project.commerce;
  if (config?.revision && config.delivery.mode === "flat")
    return {
      zones: config.delivery.shipping
        ? [
            {
              name: "Delivery",
              price: config.delivery.fee,
              from: config.delivery.freeFrom ?? NaN,
              priceText: `${config.delivery.fee} ${config.currency}`,
              term: "",
            },
          ]
        : [],
      freeText: "",
      places: [],
      pickup: {
        address: config.delivery.pickupAddress,
        hours: [],
        note: "",
        google: "",
        waze: "",
        point: null,
      },
    };

  const pages = project.pages
    .filter((p) => !p.deletedAt && p.published)
    .sort(
      (a, b) =>
        Number(b.published!.locale === locale) -
        Number(a.published!.locale === locale),
    );
  for (const page of pages)
    for (const section of page.published!.sections) {
      if (section.hidden) continue;
      const tree = plainTree(section);
      const root = first(tree, byAttr("data-dlv-calc"));
      if (!root) continue;
      const zones = all(root.children, byClass("contact__zone"))
        .map((z) => {
          const priceText = text(
            first(z.children, byClass("contact__zone-price")),
          );
          return {
            name: text(first(z.children, byClass("contact__zone-name"))),
            price: priceNumber(priceText),
            from: priceNumber(
              text(first(z.children, byClass("contact__zone-note"))),
            ),
            priceText,
            term: text(first(z.children, byClass("contact__zone-term"))),
          };
        })
        .filter((z) => z.name);
      if (!zones.length) continue;
      // Pickup point of the same block: address, opening hours (one line each), note, map links.
      const body = first(tree, byClass("contact__pickup-body"));
      const paras = body ? all(body.children, (n) => n.tag === "p") : [];
      const links = body
        ? all(body.children, (n) => n.tag === "a" && !!n.attrs.href)
        : [];
      const google =
        links.find((a) => /google\./.test(a.attrs.href))?.attrs.href || "";
      const at = google.match(
        /destination=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
      );
      return {
        zones,
        freeText: text(first(root.children, byClass("contact__calc-free"))),
        places: parsePlaces(
          rawText(first(root.children, byAttr("data-dlv-places"))),
          zones.length,
        ),
        pickup: {
          address: config?.delivery.pickupAddress || text(paras[0]),
          hours: rawText(paras[1])
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          note: text(paras[2]),
          google,
          waze:
            links.find((a) => /waze\./.test(a.attrs.href))?.attrs.href || "",
          point: at ? { lat: Number(at[1]), lon: Number(at[2]) } : null,
        },
      };
    }
  return null;
}
export const zonePrice = (zone: DeliveryZone, subtotal: number) =>
  Number.isNaN(zone.price) ||
  (!Number.isNaN(zone.from) && subtotal >= zone.from)
    ? 0
    : Math.round(zone.price * 100) / 100;

// ---------------------------------------------------------------- storage
export const withShopOrders = <T>(
  siteId: string,
  fn: (data: OrdersDoc) => T | Promise<T>,
  write = true,
) => withDoc(docId(siteId), empty, fn, write);
export const listShopOrders = (siteId: string) =>
  withDoc(docId(siteId), empty, (data) => data.items, false);
export const findCheckoutOrder = (
  siteId: string,
  requestId: string,
  requestHash: string,
) =>
  withDoc(
    docId(siteId),
    empty,
    (data) => {
      const previous =
        data.receipts?.find((r) => r.requestId === requestId) ||
        data.items.find((r) => r.requestId === requestId);
      if (previous && previous.requestHash !== requestHash)
        throw new StoreError(
          "This checkout attempt has changed. Start a new order.",
          409,
        );
      return previous || null;
    },
    false,
  );
export async function createShopOrder(
  siteId: string,
  input: Omit<
    ShopOrder,
    | "id"
    | "number"
    | "createdAt"
    | "updatedAt"
    | "revision"
    | "status"
    | "email"
    | "note"
    | "history"
  >,
) {
  const now = new Date().toISOString();
  return withDocs(
    { [docId(siteId)]: empty, [`catalog:${siteId}`]: emptyCatalog },
    (documents) => {
      const data = documents[docId(siteId)] as ReturnType<typeof empty>;
      const catalog = documents[`catalog:${siteId}`] as Catalog;
      const previous =
        input.requestId &&
        (data.receipts?.find((r) => r.requestId === input.requestId) ||
          data.items.find((r) => r.requestId === input.requestId));
      if (previous) {
        if (previous.requestHash !== input.requestHash)
          throw new StoreError(
            "This checkout attempt has changed. Start a new order.",
            409,
          );
        return { order: previous, created: false as const };
      }
      if (data.items.length >= 5000)
        throw new StoreError(
          "The shop cannot take new orders right now. Please call us.",
          503,
        );
      const order: ShopOrder = {
        ...input,
        inventory: reserveInventory(catalog, input.items),
        id: randomUUID(),
        accessKey: randomBytes(32).toString("hex"),
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
      if (order.requestId && order.requestHash) {
        const recent = (data.receipts || []).filter(
          (r) => Date.now() - Date.parse(r.createdAt) < 7 * 86400000,
        );
        if (recent.length >= 10000)
          throw new StoreError(
            "The shop is busy. Please try again later.",
            503,
          );
        recent.push({
          id: order.id,
          accessKey: order.accessKey,
          requestId: order.requestId,
          requestHash: order.requestHash,
          createdAt: order.createdAt,
          number: order.number,
          subtotal: order.subtotal,
          total: order.total,
          delivery: { price: order.delivery.price, zone: order.delivery.zone },
          currency: order.currency,
          locale: order.locale,
        });
        data.receipts = recent;
      }
      return { order, created: true as const };
    },
  );
}
export const updateShopOrder = (
  siteId: string,
  id: string,
  patch: {
    status?: ShopStatus;
    note?: string;
    revision: number;
    actor?: string;
    email?: ShopOrder["email"];
    buyerEmail?: ShopOrder["buyerEmail"];
    paymentStatus?: "paid" | "unpaid";
  },
) =>
  withDocs(
    { [docId(siteId)]: empty, [`catalog:${siteId}`]: emptyCatalog },
    (documents) => {
      const data = documents[docId(siteId)] as ReturnType<typeof empty>;
      const catalog = documents[`catalog:${siteId}`] as Catalog;
      const order = data.items.find((o) => o.id === id);
      if (!order) throw new StoreError("Order not found.", 404);
      if (patch.revision !== order.revision)
        throw new StoreError(
          "This order was updated elsewhere. Refresh first.",
          409,
        );
      const now = new Date().toISOString();
      if (
        patch.status === "cancelled" &&
        order.payment?.providerId &&
        order.payment.status === "pending"
      )
        throw new StoreError(
          "The online payment is still pending. Cancel it with the provider or wait for its final status before cancelling the order.",
          409,
        );
      if (patch.status && patch.status !== order.status) {
        if (order.inventory)
          moveInventory(
            catalog,
            order.inventory,
            patch.status === "cancelled"
              ? "released"
              : ["shipped", "done"].includes(patch.status)
                ? "committed"
                : "reserved",
          );
        if (patch.status === "cancelled" && order.payment?.status === "paid")
          order.payment.needsReview = true;
        order.status = patch.status;
        order.history.push({
          at: now,
          status: patch.status,
          kind: "status",
          actor: patch.actor,
        });
      }
      if (patch.note !== undefined && patch.note !== order.note) {
        order.note = patch.note;
        order.history.push({
          at: now,
          status: order.status,
          kind: "note",
          actor: patch.actor,
        });
      }
      if (
        patch.paymentStatus &&
        order.payment?.status !== patch.paymentStatus
      ) {
        if (
          order.payment &&
          ["stripe", "yookassa"].includes(order.payment.method)
        )
          throw new StoreError(
            "Online payment status is verified by the payment provider.",
            403,
          );
        order.history.push({
          at: now,
          status: order.status,
          kind: "payment",
          paymentStatus: patch.paymentStatus,
          actor: patch.actor,
        });
        order.payment = {
          ...(order.payment || { method: "on_receipt" }),
          needsReview:
            patch.paymentStatus === "paid" && order.status === "cancelled",
          status: patch.paymentStatus,
          ...(patch.paymentStatus === "paid"
            ? { paidAt: now }
            : { paidAt: undefined }),
        };
      }
      if (patch.email) order.email = patch.email;
      if (patch.buyerEmail) order.buyerEmail = patch.buyerEmail;
      order.revision++;
      order.updatedAt = now;
      return order;
    },
  );
export const deleteShopOrders = (siteId: string, ids: string[]) =>
  withDocs(
    { [docId(siteId)]: empty, [`catalog:${siteId}`]: emptyCatalog },
    (documents) => {
      const data = documents[docId(siteId)] as ReturnType<typeof empty>;
      const catalog = documents[`catalog:${siteId}`] as Catalog;
      for (const order of data.items)
        if (ids.includes(order.id) && order.inventory?.state === "reserved")
          moveInventory(catalog, order.inventory, "released");
      if (
        data.items.some(
          (o) =>
            ids.includes(o.id) &&
            (o.payment?.status === "paid" || o.payment?.providerId),
        )
      )
        throw new StoreError(
          "Orders with online payments must be retained for reconciliation.",
        );
      const before = data.items.length;
      data.items = data.items.filter((o) => !ids.includes(o.id));
      return { deleted: before - data.items.length };
    },
  );

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
    `Total: ${money(order.total ?? order.subtotal, order.currency)} (${paymentLabels[order.payment?.method || "on_receipt"]} · ${order.payment?.status || "unpaid"})`,
    "",
    order.customer.company
      ? `Company: ${order.customer.company.name || "(not checked in the register)"}, reg. No. ${order.customer.company.reg}${order.customer.company.address ? `, ${order.customer.company.address}` : ""}`
      : "",
    `${order.customer.company ? "Contact person" : order.customer.type === "company" ? "Company" : "Customer"}: ${order.customer.name}`,
    `Phone: ${order.customer.phone}`,
    order.customer.email ? `E-mail: ${order.customer.email}` : "",
    order.notify
      ? `Status messages: ${order.notify === "whatsapp" ? "WhatsApp" : "Telegram"}`
      : "",
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
      html: orderMailHtml(
        order,
        shopName,
        "New order",
        `Customer: ${order.customer.name}\n${order.customer.email}\n${order.customer.phone}${order.comment ? "\n\nComment: " + order.comment : ""}`,
      ),
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
    const intro =
      order.payment?.method === "invoice"
        ? "Your order is saved. Use the bank details below to complete payment."
        : order.payment && ["stripe", "yookassa"].includes(order.payment.method)
          ? "Your order is saved. Online payment confirmation is pending."
          : t.orderIntro;
    const delivery =
      order.delivery.method === "pickup"
        ? t.pickup
        : `${t.delivery}${order.delivery.zone ? ` (${order.delivery.zone})` : ""}: ${order.delivery.price ? money(order.delivery.price, order.currency) : t.free} — ${order.delivery.address}${order.delivery.flat ? `, ${order.delivery.flat}` : ""}`;
    await connection.transport.sendMail({
      from: connection.from,
      to: order.customer.email,
      replyTo: contact.email || connection.replyTo || undefined,
      subject: `${name}: ${t.orderSubject.replace("{n}", String(order.number))}`,
      html: orderMailHtml(
        order,
        name,
        t.orderSubject.replace("{n}", String(order.number)),
        intro +
          "\n\n" +
          [contact.phone, contact.email].filter(Boolean).join(" · "),
      ),
      text: [
        intro,
        "",
        ...order.items.map(
          (i) =>
            `${i.qty} × ${i.name}${i.options.length ? ` (${i.options.join(", ")})` : ""} — ${money(i.total, order.currency)}`,
        ),
        "",
        `${t.subtotal}: ${money(order.subtotal, order.currency)}`,
        delivery,
        `${t.total}: ${money(order.total ?? order.subtotal, order.currency)}`,
        "",
        order.payment?.instructions || "",
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

// Escape every customer/catalog value; no website HTML or internal notes enter the email.
const mailEscape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function orderMailHtml(
  order: ShopOrder,
  shop: string,
  title: string,
  intro: string,
) {
  const e = mailEscape;
  const t = uiText(order.locale);
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;color:#202020;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;background:white;border-radius:16px"><tr><td style="padding:32px"><p style="margin:0 0 28px;font-size:18px;font-weight:bold">${e(shop)}</p><h1 style="font-size:26px;margin:0 0 20px">${e(title)}${title.includes("#" + order.number) ? "" : " · #" + order.number}</h1><p style="white-space:pre-line;line-height:1.6;color:#555">${e(intro)}</p><table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">${order.items.map((i) => `<tr><td style="padding:14px 0;border-bottom:1px solid #eee">${e(i.name)}<br><span style="font-size:12px;color:#777">${e([i.sku, ...i.options].filter(Boolean).join(" · "))}</span><br><span style="font-size:13px">${i.qty} × ${e(money(i.unitPrice, order.currency))}</span></td><td align="right" style="white-space:nowrap;border-bottom:1px solid #eee">${e(money(i.total, order.currency))}</td></tr>`).join("")}<tr><td style="padding-top:18px">${e(order.delivery.method === "pickup" ? t.pickup : t.delivery)}</td><td align="right" style="padding-top:18px">${e(money(order.delivery.price || 0, order.currency))}</td></tr><tr><td style="padding-top:14px;font-weight:bold">${e(t.total)}</td><td align="right" style="padding-top:14px;font-weight:bold">${e(money(order.total ?? order.subtotal, order.currency))}</td></tr></table><p style="margin-top:24px;color:#555;line-height:1.6">${e(paymentLabels[order.payment?.method || "on_receipt"])} · ${e(order.payment?.status || "unpaid")}</p>${order.payment?.instructions ? `<p style="white-space:pre-line">${e(order.payment.instructions)}</p>` : ""}<p style="margin-top:24px;color:#555;line-height:1.6">${e(order.delivery.method === "pickup" ? t.pickup : order.delivery.address + (order.delivery.flat ? ", " + order.delivery.flat : ""))}</p></td></tr></table></td></tr></table></body></html>`;
}
// Claim before external I/O, then settle without a stale UI revision overwriting order edits.
export async function sendOrderMail(
  siteId: string,
  id: string,
  target: "shop" | "buyer",
  send: (order: ShopOrder) => Promise<"none" | "sent" | "failed">,
  retryUncertain = false,
) {
  const attempt = randomUUID();
  const order = await withDoc(docId(siteId), empty, (data) => {
    const order = data.items.find((o) => o.id === id);
    if (!order) throw new StoreError("Order not found.", 404);
    const state = target === "shop" ? order.email : order.buyerEmail;
    if (state === "sent")
      throw new StoreError(
        "This email has already been accepted by the mail server.",
        409,
      );
    if (
      order.mail?.[target]?.state === "sending" &&
      !(
        retryUncertain &&
        Date.now() - Date.parse(order.mail[target]!.at) > 120000
      )
    )
      throw new StoreError(
        "This email is being sent. Refresh the order before trying again.",
        409,
      );
    order.mail = {
      ...order.mail,
      [target]: { state: "sending", at: new Date().toISOString(), attempt },
    };
    order.revision++;
    return structuredClone(order);
  });
  let state: "none" | "sent" | "failed";
  try {
    state = await send(order);
  } catch {
    state = "failed";
  }
  return withDoc(docId(siteId), empty, (data) => {
    const order = data.items.find((o) => o.id === id);
    if (!order) throw new StoreError("Order not found.", 404);
    if (order.mail?.[target]?.attempt !== attempt)
      throw new StoreError("Email attempt changed.", 409);
    order.mail[target] = { state, attempt, at: new Date().toISOString() };
    if (target === "shop") order.email = state;
    else order.buyerEmail = state;
    order.revision++;
    order.updatedAt = new Date().toISOString();
    return order;
  });
}

export async function settleOrderPayment(
  site: string,
  id: string,
  update: OrderPayment,
) {
  return withDocs(
    { [docId(site)]: empty, [`catalog:${site}`]: emptyCatalog },
    (docs) => {
      const order = (docs[docId(site)] as OrdersDoc).items.find(
        (o) => o.id === id,
      );
      if (!order) throw new StoreError("Order not found.", 404);
      if (order.payment?.status === "paid") return order;
      if (order.payment?.attempt !== update.attempt)
        throw new StoreError("Payment attempt changed.", 409);
      if (
        update.status === "cancelled" &&
        ["new", "confirmed"].includes(order.status)
      ) {
        if (order.inventory)
          moveInventory(
            docs[`catalog:${site}`] as Catalog,
            order.inventory,
            "released",
          );
        order.status = "cancelled";
        order.history.push({
          at: new Date().toISOString(),
          status: "cancelled",
        });
      }
      if (order.payment?.status !== update.status)
        order.history.push({
          at: new Date().toISOString(),
          status: order.status,
          kind: "payment",
          paymentStatus: update.status,
        });
      order.payment = {
        ...update,
        needsReview: update.status === "paid" && order.status === "cancelled",
      };
      order.revision++;
      order.updatedAt = new Date().toISOString();
      return order;
    },
  );
}
