import "server-only";
import { preserveReserves } from "./inventory";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withDoc } from "../doc-store";
import { StoreError } from "../server";
import { LOCALES, pagePrefix, type Locale } from "../i18n";
import type { Project } from "../types";
import { PRODUCT_BLOCK } from "./apply";
import {
  catalogAttributes,
  emptyCatalog,
  emptyText,
  LIMITS,
  STOCK,
  type Catalog,
  type Product,
} from "./shared";

// Catalogue document of a website: `catalog:{siteId}` (PostgreSQL row or .data/catalog-{siteId}.json).
const docId = (siteId: string) => `catalog:${siteId}`;
const normalize = (data: Partial<Catalog> | null | undefined): Catalog => {
  const empty = emptyCatalog();
  return {
    ...empty,
    ...data,
    settings: { ...empty.settings, ...data?.settings },
    products: (data?.products || []).map((p) => ({
      ...p,
      text: Object.fromEntries(
        Object.entries(p.text || {}).map(([l, t]) => [
          l,
          { ...emptyText(), ...t },
        ]),
      ),
    })),
    moved: data?.moved || [],
    retired: data?.retired || [],
  };
};
// Read through the same transaction queue so a local interrupted checkout is recovered first.
export async function readCatalog(siteId: string): Promise<Catalog> {
  return withDoc(docId(siteId), emptyCatalog, (data) => normalize(data), false);
}
const mutate = <T>(siteId: string, update: (data: Catalog) => T) =>
  withDoc(docId(siteId), emptyCatalog, (raw: Catalog) => {
    const data = normalize(raw);
    const result = update(data);
    data.revision++;
    Object.assign(raw, data);
    return result;
  });

// ---------------------------------------------------------------- validation
const str = (max: number) => z.string().trim().max(max).default("");
const money = z
  .number()
  .min(0)
  .max(10_000_000)
  .transform((n) => Math.round(n * 100) / 100);
const slug = z
  .string()
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Product address: Latin letters, digits and dashes.",
  )
  .max(100)
  .refine(
    (s) => !(LOCALES as readonly string[]).includes(s),
    "A product address cannot be a language code.",
  );
const spec = z.object({ key: str(120), value: str(500) });
const specs = (max: number) =>
  z
    .array(spec)
    .max(max)
    .default([])
    .transform((list) => {
      const out = list.slice();
      while (out.length && !out.at(-1)!.key && !out.at(-1)!.value) out.pop();
      return out;
    });
const textSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Each language needs a product name.")
    .max(200),
  slug,
  subtitle: str(200),
  summary: str(1000),
  description: str(5000),
  imageAlt: str(300),
  badge: str(40),
  priceNote: str(300),
  seoTitle: str(300),
  seoDescription: str(1000),
  topSpecs: specs(LIMITS.topSpecs),
  cardSpecs: specs(LIMITS.cardSpecs),
  specs: specs(LIMITS.specs),
});
const localized = (max: number) =>
  z.partialRecord(z.enum(LOCALES), z.string().trim().max(max)).default({});
const mediaImages = z
  .array(
    z
      .string()
      .max(2000)
      .refine(
        (u) => u.startsWith("/") && !u.startsWith("//"),
        "Choose photos from the media library.",
      ),
  )
  .max(LIMITS.images)
  .default([]);
const variantInput = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,60}$/),
    name: z.string().trim().max(120).default(""),
    attributes: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(40),
          value: z.string().trim().min(1).max(80),
        }),
      )
      .max(5)
      .default([]),
    sku: str(60),
    price: money,
    oldPrice: money.nullable().default(null),
    images: mediaImages,
    stock: z.enum(STOCK).default("in_stock"),
    qty: z.number().int().min(0).max(1_000_000).nullable().default(null),
    hidden: z.boolean().default(false),
  })
  .refine(
    (v) => !!v.name || !!v.attributes.length,
    "Give each variation a name or attributes.",
  );
export const productInput = z.object({
  variants: z
    .array(variantInput)
    .max(100)
    .default([])
    .refine(
      (v) => new Set(v.map((x) => x.id)).size === v.length,
      "Variation IDs must be unique.",
    ),
  sku: str(60),
  category: str(100),
  price: money,
  oldPrice: money.nullable().default(null),
  stock: z.enum(STOCK).default("in_stock"),
  qty: z.number().int().min(0).max(1_000_000).nullable().default(null),
  images: z
    .array(
      z
        .string()
        .max(2000)
        .refine(
          (u) => u.startsWith("/") && !u.startsWith("//"),
          "Choose photos from the media library.",
        ),
    )
    .max(LIMITS.images)
    .default([]),
  hidden: z.boolean().default(false),
  filters: z
    .record(z.string().regex(/^[a-z0-9-]{1,40}$/), z.string().trim().max(1000))
    .refine((v) => Object.keys(v).length <= 10)
    .default({}),
  options: z
    .array(
      z.object({
        label: localized(120),
        choices: z
          .array(
            z.object({
              name: localized(120),
              delta: z.number().min(-1_000_000).max(1_000_000),
            }),
          )
          .max(LIMITS.choices),
      }),
    )
    .max(LIMITS.options)
    .default([]),
  text: z
    .partialRecord(z.enum(LOCALES), textSchema)
    .refine(
      (t) => Object.keys(t).length > 0,
      "Add the product name in at least one language.",
    ),
  pages: z.partialRecord(z.enum(LOCALES), z.string().max(100)).default({}),
});
export type ProductInput = z.infer<typeof productInput>;
export const settingsInput = z.object({
  filterVisibility: z.enum(["auto", "show", "hide"]).default("auto"),
  attributes: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9-]{1,40}$/),
        label: z.string().trim().min(1).max(60),
        values: z.array(z.string().trim().min(1).max(60)).max(100),
      }),
    )
    .max(40)
    .refine(
      (a) => new Set(a.map((x) => x.key)).size === a.length,
      "Attribute keys must be unique",
    )
    .optional(),
  templates: z.partialRecord(z.enum(LOCALES), z.string().max(100)).default({}),
  filters: z
    .array(
      z.object({
        key: z
          .string()
          .regex(
            /^[a-z0-9-]{1,40}$/,
            "Filter key: lower-case letters, digits, dashes.",
          ),
        label: str(60),
      }),
    )
    .max(LIMITS.filters)
    .refine(
      (f) => new Set(f.map((x) => x.key)).size === f.length,
      "Filter keys must be unique.",
    ),
  priceFormat: z
    .string()
    .trim()
    .max(20)
    .refine(
      (f) => f.includes("{n}"),
      'The price format needs "{n}" for the number.',
    ),
  includedLabel: localized(60),
  categories: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
});

// Checks that need the website's pages: own pages (language, product block, one product each)
// and addresses (unique among the website's pages and other products).
function checkAgainstSite(
  input: ProductInput,
  id: string,
  catalog: Catalog,
  project: Project,
) {
  const skus = [input.sku, ...input.variants.map((v) => v.sku)]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  if (
    new Set(skus).size !== skus.length ||
    catalog.products.some(
      (p) =>
        p.id !== id &&
        [p.sku, ...(p.variants || []).map((v) => v.sku)].some(
          (s) => s && skus.includes(s.toLowerCase()),
        ),
    )
  )
    throw new StoreError("Each product and variation needs a unique SKU.");
  const current = catalog.products.find((p) => p.id === id);
  if (current) {
    if (
      (current.reserved || 0) > 0 &&
      (input.qty === null || input.qty < (current.reserved || 0))
    )
      throw new StoreError("Quantity cannot be lower than the reserved stock.");
    if (input.variants.length && (current.reserved || 0) > 0)
      throw new StoreError(
        "Complete or cancel existing reservations before enabling variations.",
      );
    for (const before of current.variants || []) {
      const next = input.variants.find((v) => v.id === before.id);
      if (
        (before.reserved || 0) > 0 &&
        (!next || next.qty === null || next.qty < (before.reserved || 0))
      )
        throw new StoreError(
          "A reserved variation cannot be removed or reduced below its reserved stock.",
        );
    }
  }
  for (const [locale, pageId] of Object.entries(input.pages) as [
    Locale,
    string,
  ][]) {
    if (!pageId) continue;
    const page = project.pages.find((p) => p.id === pageId && !p.deletedAt);
    if (
      !page ||
      page.locale !== locale ||
      !(page.published || page).sections.some(
        (s) => s.variant === PRODUCT_BLOCK,
      )
    )
      throw new StoreError(
        "A product page must be an existing page of that language with a product block.",
      );
    if (catalog.products.some((p) => p.id !== id && p.pages[locale] === pageId))
      throw new StoreError(
        `Page "${page.title}" already shows another product.`,
      );
  }
  for (const [locale, text] of Object.entries(input.text) as [
    Locale,
    { slug: string; name: string },
  ][]) {
    const own = input.pages[locale];
    const page = project.pages.find(
      (p) =>
        !p.deletedAt &&
        p.id !== own &&
        (p.slug === text.slug || p.published?.slug === text.slug),
    );
    if (page)
      throw new StoreError(
        `The address "${text.slug}" belongs to the page "${page.title}".`,
      );
    const other = catalog.products.find(
      (p) =>
        p.id !== id && Object.values(p.text).some((t) => t?.slug === text.slug),
    );
    if (other)
      throw new StoreError(
        `The address "${text.slug}" is used by another product.`,
      );
  }
}
// The same checks for the import preview: the problem as text, or "".
export function siteConflict(
  input: ProductInput,
  id: string,
  catalog: Catalog,
  project: Project,
) {
  try {
    checkAgainstSite(input, id, catalog, project);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid product.";
  }
}
const sitePath = (project: Project, slug: string, locale: string) => {
  const prefix = pagePrefix(project.languages, locale);
  return prefix ? `/${prefix}/${slug}` : `/${slug}`;
};
function remember(
  catalog: Catalog,
  project: Project,
  before: Product,
  after: ProductInput,
) {
  for (const [locale, text] of Object.entries(after.text) as [
    Locale,
    { slug: string },
  ][]) {
    const old = before.text[locale]?.slug;
    if (!old || old === text.slug) continue;
    const from = sitePath(project, old, locale);
    catalog.moved = catalog.moved.filter(
      (m) => m.from !== from && m.from !== sitePath(project, text.slug, locale),
    );
    catalog.moved.push({ from, productId: before.id, locale });
  }
  catalog.moved = catalog.moved.slice(-500);
}

// ---------------------------------------------------------------- operations
export async function createProduct(
  siteId: string,
  input: ProductInput,
  project: Project,
) {
  return mutate(siteId, (catalog) => {
    if (catalog.products.length >= 2000)
      throw new StoreError("The catalogue is full (2000 products).");
    const id = randomUUID().replace(/-/g, "").slice(0, 12);
    checkAgainstSite(input, id, catalog, project);
    const now = new Date().toISOString();
    const product: Product = {
      ...input,
      id,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    } as Product;
    catalog.products.push(product);
    catalog.settings.attributes = catalogAttributes(catalog);
    return product;
  });
}
export async function updateProduct(
  siteId: string,
  id: string,
  revision: number,
  input: ProductInput,
  project: Project,
) {
  return mutate(siteId, (catalog) => {
    const at = catalog.products.findIndex((p) => p.id === id);
    if (at < 0) throw new StoreError("Product not found.", 404);
    const before = catalog.products[at];
    if (before.revision !== revision)
      throw new StoreError(
        "This product was changed elsewhere. Reload it first.",
        409,
      );
    checkAgainstSite(input, id, catalog, project);
    remember(catalog, project, before, input);
    input.variants = preserveReserves(before, input.variants);
    // A page no longer used by the product stays as an ordinary page.
    const product: Product = {
      ...before,
      ...input,
      updatedAt: new Date().toISOString(),
      revision: before.revision + 1,
    } as Product;
    catalog.products[at] = product;
    catalog.settings.attributes = catalogAttributes(catalog);
    return product;
  });
}
export const quickPatch = z.object({
  category: z.string().trim().max(100).optional(),
  id: z.string().min(1).max(40),
  revision: z.number().int().nonnegative(),
  price: money.optional(),
  oldPrice: money.nullable().optional(),
  stock: z.enum(STOCK).optional(),
  qty: z.number().int().min(0).max(1_000_000).nullable().optional(),
  hidden: z.boolean().optional(),
});
// Price / stock / visibility straight from the list.
export async function patchProduct(
  siteId: string,
  patch: z.infer<typeof quickPatch>,
) {
  return mutate(siteId, (catalog) => {
    const product = catalog.products.find((p) => p.id === patch.id);
    if (!product) throw new StoreError("Product not found.", 404);
    if (product.revision !== patch.revision)
      throw new StoreError(
        "This product was changed elsewhere. Reload first.",
        409,
      );
    if (
      patch.qty !== undefined &&
      (product.reserved || 0) > 0 &&
      (patch.qty === null || patch.qty < (product.reserved || 0))
    )
      throw new StoreError("Quantity cannot be lower than the reserved stock.");
    const { id: _id, revision: _revision, ...change } = patch;
    void _id;
    void _revision;
    Object.assign(
      product,
      Object.fromEntries(
        Object.entries(change).filter(([, v]) => v !== undefined),
      ),
    );
    product.revision++;
    product.updatedAt = new Date().toISOString();
    return product;
  });
}
export async function deleteProducts(siteId: string, ids: string[]) {
  return mutate(siteId, (catalog) => {
    const removed = catalog.products.filter((p) => ids.includes(p.id));
    if (
      removed.some(
        (p) =>
          (p.reserved || 0) > 0 ||
          p.variants?.some((v) => (v.reserved || 0) > 0),
      )
    )
      throw new StoreError(
        "Complete or cancel reservations before deleting this product.",
      );
    catalog.products = catalog.products.filter((p) => !ids.includes(p.id));
    // Their own pages stop being public; links from cards and grids disappear with the product.
    for (const p of removed)
      for (const pageId of Object.values(p.pages))
        if (pageId && !catalog.retired.includes(pageId))
          catalog.retired.push(pageId);
    catalog.moved = catalog.moved.filter((m) => !ids.includes(m.productId));
    return { deleted: removed.length };
  });
}
export async function saveSettings(
  siteId: string,
  settings: z.infer<typeof settingsInput>,
  project: Project,
) {
  for (const [locale, pageId] of Object.entries(settings.templates)) {
    if (!pageId) continue;
    const page = project.pages.find((p) => p.id === pageId && !p.deletedAt);
    if (
      !page ||
      page.locale !== locale ||
      !(page.published || page).sections.some(
        (s) => s.variant === PRODUCT_BLOCK,
      )
    )
      throw new StoreError(
        "A template must be a page of that language with a product block.",
      );
  }
  return mutate(siteId, (catalog) => {
    const previous = catalogAttributes(catalog);
    for (const a of settings.attributes || []) {
      const old = previous.find((x) => x.key === a.key);
      a.values = [...new Set([...a.values, ...(old?.values || [])])];
    }
    catalog.settings = {
      ...settings,
      attributes: settings.attributes ?? previous,
    };
    return catalog.settings;
  });
}
// Rows of an import (already matched and validated): creates and updates in one write.
export async function importProducts(
  siteId: string,
  rows: { id?: string; input: ProductInput }[],
  project: Project,
) {
  return mutate(siteId, (catalog) => {
    let created = 0,
      updated = 0;
    const now = new Date().toISOString();
    for (const row of rows) {
      const at = row.id
        ? catalog.products.findIndex((p) => p.id === row.id)
        : -1;
      const id =
        at >= 0 ? row.id! : randomUUID().replace(/-/g, "").slice(0, 12);
      checkAgainstSite(row.input, id, catalog, project);
      if (at >= 0) {
        remember(catalog, project, catalog.products[at], row.input);
        row.input.variants = preserveReserves(
          catalog.products[at],
          row.input.variants,
        );
        catalog.products[at] = {
          ...catalog.products[at],
          ...row.input,
          updatedAt: now,
          revision: catalog.products[at].revision + 1,
        } as Product;
        updated++;
      } else {
        if (catalog.products.length >= 2000)
          throw new StoreError("The catalogue is full (2000 products).");
        catalog.products.push({
          ...row.input,
          id,
          createdAt: now,
          updatedAt: now,
          revision: 0,
        } as Product);
        created++;
      }
    }
    return { created, updated };
  });
}

// Client-safe content update: never accepts templates, filters, prices or visual settings.
export async function saveCategories(
  siteId: string,
  categories: string[],
  revision: number,
) {
  return mutate(siteId, (catalog) => {
    if (catalog.revision !== revision)
      throw new StoreError(
        "The catalogue has changed. Reload this page before saving.",
        409,
      );
    catalog.settings.categories = [...new Set(categories)];
    return { settings: catalog.settings, revision: catalog.revision + 1 };
  });
}
