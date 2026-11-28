// Fills a website's pages from its product catalogue (pure; no storage access).
// Used by every public reader (products/public.ts) and by the shop checkout, so what visitors
// see, what search engines index and what the server charges always come from the catalogue:
// - product pages: a product's own page (Product.pages) gets the catalogue's texts, photos, price,
//   options and specification in its product block (pricing-v22), breadcrumb (hero-v20), title,
//   address and SEO texts; a product without its own page gets a page built from the template
//   page of that language (CatalogSettings.templates), same blocks, own address;
// - catalogue grids (pricing-v21) list every visible product of the page language, with filter
//   chips built from the products' filter values;
// - product cards (pricing-v20) that link to a product follow it (price, photo, texts) and
//   disappear when it is hidden or deleted; "similar" cards on built pages are the nearest by price;
// - hidden products and pages of deleted products are not public (404); old addresses of
//   products whose URL changed redirect to the new one.
// The stored project is never changed: the result is a copy for this request.
import type {
  CmsPage,
  CollectionItem,
  PageSnapshot,
  Project,
  Section,
} from "../types";
import { definition } from "../catalog";
import { collectionItems } from "../collections";
import { pageHref, type Locale } from "../i18n";
import { normalizePath } from "../seo/schema";
import {
  attributeValues,
  discountLabel,
  availableQty,
  formatPrice,
  LIMITS,
  type Catalog,
  type Product,
  type ProductText,
  type Spec,
} from "./shared";

export const PRODUCT_BLOCK = "pricing-v22";
export const GRID_BLOCK = "pricing-v21";
export const CARD_BLOCK = "pricing-v20";
// Pages filled from the catalogue → product, per applied project (checkout stock check, JSON-LD).
const formats = new WeakMap<Project, string>();
const filterModes = new WeakMap<Project, string>();
export const catalogFilterMode = (project: Project) => filterModes.get(project);
const filterCounts = new WeakMap<Project, number>();
export const catalogFilterCount = (project: Project) =>
  filterCounts.get(project);
export const catalogPriceFormat = (project: Project) =>
  formats.get(project) || "{n} €";
const pageProducts = new WeakMap<Project, Map<string, Product>>();
export const catalogProductOf = (project: Project, pageId: string) =>
  pageProducts.get(project)?.get(pageId);
export const catalogProductById = (project: Project, id: string) =>
  [...(pageProducts.get(project)?.values() || [])].find((p) => p.id === id);
export function catalogProductByHref(
  project: Project,
  href: string,
  locale: string,
) {
  let path: string;
  try {
    path = new URL(href, "https://local.invalid").pathname;
  } catch {
    return undefined;
  }
  const page = project.pages.find(
    (p) =>
      p.locale === locale && path.endsWith(`/${p.published?.slug || p.slug}`),
  );
  return page ? catalogProductOf(project, page.id) : undefined;
}
// Product by its name in a language (product cards in the checkout).
const namedProducts = new WeakMap<Project, Map<string, Product>>();
export const catalogProductNamed = (
  project: Project,
  locale: string,
  name: string,
) => namedProducts.get(project)?.get(`${locale}:${name}`);
// Keeps those lookups on a derived copy (publicProject() of an applied project).
export function keepCatalogInfo<T extends Project>(from: Project, to: T): T {
  const mode = filterModes.get(from);
  if (mode) filterModes.set(to, mode);
  const count = filterCounts.get(from);
  if (count !== undefined) filterCounts.set(to, count);
  const format = formats.get(from);
  if (format) formats.set(to, format);
  const info = pageProducts.get(from);
  if (info) pageProducts.set(to, info);
  const named = namedProducts.get(from);
  if (named) namedProducts.set(to, named);
  return to;
}

const live = (p: CmsPage) => !p.deletedAt && !!p.published;

export function applyCatalog(
  project: Project,
  catalog: Catalog | null,
  siteKey: string,
): Project {
  if (!catalog || (!catalog.products.length && !catalog.retired.length))
    return project;
  const { settings } = catalog;
  const fmt = (n: number) => formatPrice(n, settings.priceFormat);
  const pages = project.pages.slice();
  const index = new Map(pages.map((p, i) => [p.id, i]));
  const byId = (id: string | undefined) =>
    id ? pages[index.get(id) ?? -1] : undefined;
  const owned = new Map<string, Product>();
  const virtual = new Set<string>();
  const gone = new Set(catalog.retired);
  // Current address of a product per language, and every address it had (incl. hidden ones).
  const current = new Map<string, string>();
  const hrefs = new Map<string, { product: Product; locale: string }>();
  const href = (slug: string, locale: string) =>
    pageHref(project, siteKey, { slug, locale });
  const used = new Set(
    pages
      .filter((p) => !p.deletedAt)
      .flatMap((p) => [p.slug, p.published?.slug || p.slug]),
  );
  const firstBound = (locale: string) =>
    catalog.products
      .map((p) => byId(p.pages[locale as Locale]))
      .find((p) => p && live(p) && p.published!.locale === locale);
  const template = (locale: string) => {
    const chosen = byId(settings.templates[locale as Locale]);
    const page = chosen && live(chosen) ? chosen : firstBound(locale);
    return page?.published!.sections.some((s) => s.variant === PRODUCT_BLOCK)
      ? page
      : undefined;
  };

  for (const product of catalog.products)
    for (const [locale, text] of Object.entries(product.text) as [
      Locale,
      ProductText,
    ][]) {
      if (!text?.name || !text.slug) continue;
      const bound = byId(product.pages[locale]);
      if (bound && live(bound) && bound.published!.locale === locale) {
        hrefs.set(href(bound.published!.slug, locale), { product, locale });
        hrefs.set(href(text.slug, locale), { product, locale });
        if (product.hidden) {
          gone.add(bound.id);
          continue;
        }
        pages[index.get(bound.id)!] = {
          ...bound,
          published: productSnapshot(
            bound.published!,
            product,
            locale,
            text,
            fmt,
            settings.includedLabel[locale],
          ),
        };
        owned.set(bound.id, product);
        current.set(`${product.id}:${locale}`, href(text.slug, locale));
        continue;
      }
      hrefs.set(href(text.slug, locale), { product, locale });
      if (product.hidden || used.has(text.slug)) continue;
      const pattern = template(locale);
      if (!pattern) continue;
      const id = `cat-${product.id}-${locale}`;
      // Section ids get a product prefix: site CSS written for one product's sections stays on it.
      const prefix = `c${product.id.slice(0, 10)}-`;
      const base = pattern.published!;
      const snapshot = productSnapshot(
        {
          ...base,
          sections: base.sections.map((s) => ({
            ...structuredClone(s),
            id: (prefix + s.id).slice(0, 100),
          })),
        },
        product,
        locale,
        text,
        fmt,
        settings.includedLabel[locale],
      );
      const page: CmsPage = {
        id,
        title: snapshot.title,
        slug: snapshot.slug,
        locale,
        translationGroup: `cat-${product.id}`,
        status: "Published",
        sections: snapshot.sections,
        seo: snapshot.seo,
        updatedAt: product.updatedAt,
        published: { ...snapshot, updatedAt: product.updatedAt },
      };
      index.set(id, pages.length);
      pages.push(page);
      used.add(text.slug);
      owned.set(id, product);
      virtual.add(id);
      current.set(`${product.id}:${locale}`, href(text.slug, locale));
    }

  const visible = (locale: string) =>
    catalog.products.filter(
      (p) => !p.hidden && current.has(`${p.id}:${locale}`),
    );
  const card = (
    fields: string[],
    base: Record<string, string>,
    p: Product,
    locale: string,
  ) => {
    const t = p.text[locale as Locale]!;
    const url = current.get(`${p.id}:${locale}`)!;
    const v = Object.fromEntries(fields.map((k) => [k, base[k] ?? ""]));
    // Card fields in template order: link, photo, alt, discount, badge, title, link,
    // 4 × (label, value), price, old price, order label, order link[, filter tags].
    const set = (i: number, value: string) => {
      if (fields[i]) v[fields[i]] = value;
    };
    set(0, url);
    set(
      1,
      p.images[0] ||
        p.variants?.find((v) => !v.hidden && v.images.length)?.images[0] ||
        "",
    );
    set(2, t.imageAlt || t.name);
    set(3, p.variants?.length ? "" : discountLabel(p.price, p.oldPrice));
    set(4, t.badge);
    set(5, t.name);
    set(6, url);
    for (let i = 0; i < 4; i++) {
      set(7 + i * 2, t.cardSpecs[i]?.key || "");
      set(8 + i * 2, t.cardSpecs[i]?.value || "");
    }
    const prices =
      p.variants?.filter((v) => !v.hidden).map((v) => v.price) || [];
    set(15, prices.length ? `From ${fmt(Math.min(...prices))}` : fmt(p.price));
    set(16, !p.variants?.length && p.oldPrice ? fmt(p.oldPrice) : "");
    set(
      17,
      p.stock === "out_of_stock" ||
        (p.stock !== "to_order" && availableQty(p) === 0)
        ? "Out of stock"
        : "Add to bag",
    );
    set(18, url);
    if (p.variants?.length) {
      set(17, "Choose options");
      set(18, url);
    }
    if (fields.length > 19)
      set(
        19,
        settings.filters
          .flatMap((f) => attributeValues(p.filters[f.key]))
          .filter(Boolean)
          .join(", "),
      );
    return v;
  };
  const products = catalog.products.length > 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!live(page) || gone.has(page.id)) continue;
    const locale = page.published!.locale;
    let changed = false;
    const sections = page.published!.sections.map((section) => {
      const entry = definition(section.variant);
      const group = entry?.repeaters?.[0];
      if (
        !entry ||
        !group ||
        ![GRID_BLOCK, CARD_BLOCK].includes(section.variant)
      )
        return section;
      const existing = collectionItems(section, entry, group);
      const first = existing[0];
      const template = first?.template ?? 0;
      const fields = group.items[template]?.fields || [];
      let items: CollectionItem[];
      let values = section.values;
      if (section.variant === GRID_BLOCK) {
        if (!products) return section;
        items = visible(locale)
          .slice(0, group.max ?? 30)
          .map((p, n) => ({
            id: `${section.id}-${group.id}-${n + 1}`,
            template,
            values: card(fields, first?.values || {}, p, locale),
          }));
        values = { ...section.values, ...chips(section.values, locale) };
      } else if (virtual.has(page.id)) {
        // Cards on a built product page: the products nearest in price.
        const self = owned.get(page.id)!;
        items = visible(locale)
          .filter((p) => p.id !== self.id)
          .sort(
            (a, b) =>
              Math.abs(a.price - self.price) - Math.abs(b.price - self.price),
          )
          .slice(0, existing.length)
          .map((p, n) => ({
            id: `${section.id}-${group.id}-${n + 1}`,
            template,
            values: card(fields, first?.values || {}, p, locale),
          }));
      } else {
        let touched = false;
        items = existing.flatMap((item) => {
          const f = group.items[item.template]?.fields || [];
          const hit = hrefs.get(item.values[f[0]] ?? "");
          if (!hit) return [item];
          touched = true;
          if (
            !current.has(`${hit.product.id}:${hit.locale}`) ||
            hit.product.hidden
          )
            return [];
          return [
            { ...item, values: card(f, item.values, hit.product, hit.locale) },
          ];
        });
        if (!touched) return section;
      }
      changed = true;
      return {
        ...section,
        values,
        collections: { ...section.collections, [group.id]: items },
      };
    });
    if (changed)
      pages[i] = { ...page, published: { ...page.published!, sections } };
  }
  // Filter chips of the catalogue grid: chip group n = filter n of the settings, values ordered by
  // the cheapest product that has them (pricing-v21: legend text-(7+10n), chips text-(9+10n)…(16+10n)).
  function chips(values: Record<string, string>, locale: string) {
    const out: Record<string, string> = {};
    settings.filters.slice(0, LIMITS.filters).forEach((filter, n) => {
      out[`text-${7 + n * 10}`] = filter.label;
      const cheapest = new Map<string, number>();
      for (const p of visible(locale)) {
        for (const value of attributeValues(p.filters[filter.key]))
          if (value)
            cheapest.set(
              value,
              Math.min(cheapest.get(value) ?? Infinity, p.price),
            );
      }
      if (cheapest.size < 2) out[`text-${7 + n * 10}`] = "";
      const list = [...cheapest].sort((a, b) => a[1] - b[1]).map(([v]) => v);
      for (let c = 0; c < 8; c++) {
        const key = `text-${9 + n * 10 + c}`;
        if (
          key in values ||
          definition(GRID_BLOCK)?.fields.some((f) => f.key === key)
        )
          out[key] = list[c] || "";
      }
    });
    return out;
  }

  for (const id of gone) {
    const at = index.get(id);
    if (at !== undefined)
      pages[at] = { ...pages[at], deletedAt: pages[at].deletedAt || "catalog" };
  }
  // Old product addresses → the product's page in that language.
  const pageOf = new Map(
    [...owned].map(([pageId, p]) => [
      `${p.id}:${byId(pageId)!.published!.locale}`,
      pageId,
    ]),
  );
  const extra = catalog.moved
    .map((m, n) => ({
      id: `catalog-${n}`,
      from: normalizePath(m.from),
      to: pageOf.get(`${m.productId}:${m.locale}`) || "",
    }))
    .filter(
      (r) =>
        r.to &&
        r.from.length > 1 &&
        !project.seo?.redirects?.some((x) => x.from === r.from),
    );
  const result: Project = {
    ...project,
    pages,
    ...(extra.length
      ? {
          seo: {
            ...project.seo,
            redirects: [...(project.seo?.redirects || []), ...extra],
          },
        }
      : {}),
  };
  formats.set(result, settings.priceFormat);
  filterModes.set(result, settings.filterVisibility || "auto");
  filterCounts.set(result, settings.filters.length);
  pageProducts.set(result, owned);
  namedProducts.set(
    result,
    new Map(
      catalog.products.flatMap((p) =>
        Object.entries(p.text).flatMap(([l, t]) =>
          t?.name ? [[`${l}:${t.name}`, p] as const] : [],
        ),
      ),
    ),
  );
  return result;
}

const pairs = (
  v: Record<string, string>,
  start: number,
  list: Spec[],
  count: number,
) => {
  for (let i = 0; i < count; i++) {
    v[`text-${start + i * 2}`] = list[i]?.key || "";
    v[`text-${start + i * 2 + 1}`] = list[i]?.value || "";
  }
};
// Product block (pricing-v22), breadcrumb (hero-v20), option picker photos (pricing-v25), page texts.
function productSnapshot(
  snapshot: PageSnapshot,
  product: Product,
  locale: Locale,
  t: ProductText,
  fmt: (n: number) => string,
  included = "",
): PageSnapshot {
  const block = snapshot.sections.find((s) => s.variant === PRODUCT_BLOCK);
  const oldMain = block?.values["image-1"] || "";
  const visibleVariants = product.variants?.filter((v) => !v.hidden) || [];
  const firstVariant =
    visibleVariants.find(
      (v) =>
        v.stock !== "out_of_stock" &&
        (v.stock === "to_order" ||
          availableQty(v) === null ||
          (availableQty(v) || 0) > 0),
    ) || visibleVariants[0];
  const main =
    firstVariant?.images[0] ||
    product.images[0] ||
    visibleVariants.find((v) => v.images.length)?.images[0] ||
    "";
  const sections = snapshot.sections.map((s): Section => {
    if (s === block) {
      const v = { ...s.values };
      for (let i = 0; i < LIMITS.images; i++) {
        v[`image-${i + 1}`] = product.images[i] || (i === 0 ? main : "");
        v[`text-${i + 1}`] = v[`image-${i + 1}`] ? t.imageAlt || t.name : "";
      }
      // The option row's picture repeats the main photo.
      if ("image-6" in s.values && s.values["image-6"] === oldMain)
        v["image-6"] = main;
      v["textarea-1"] = t.subtitle;
      v["heading-1"] = t.name;
      v["textarea-2"] = t.summary;
      pairs(v, 6, t.topSpecs, LIMITS.topSpecs);
      for (let g = 0; g < LIMITS.options; g++) {
        const option = product.variants?.length
          ? undefined
          : product.options[g];
        v[`textarea-${3 + g}`] = option?.label[locale] || "";
        for (let c = 0; c < LIMITS.choices; c++) {
          const choice = option?.choices[c];
          const at = 14 + g * 4 + c * 2;
          v[`text-${at}`] = choice?.name[locale] || "";
          v[`text-${at + 1}`] = !choice
            ? ""
            : choice.delta > 0
              ? `+${fmt(choice.delta)}`
              : choice.delta < 0
                ? `-${fmt(-choice.delta)}`
                : included || "Included";
        }
      }
      // The catalog owns real options. The static template's frame picker has
      // no corresponding product field and must never leak into a live SKU.
      for (let i = 34; i <= 39; i++) v[`text-${i}`] = "";
      v["image-6"] = "";
      v["url-1"] = "";
      // Keep merchant-written facts, omit untouched demo delivery/warranty claims.
      const defaults = definition(PRODUCT_BLOCK)?.fields || [];
      for (let i = 40; i <= 46; i += 2) {
        const key = `text-${i}`;
        if (v[key] === defaults.find((f) => f.key === key)?.value) {
          v[key] = "";
          v[`text-${i + 1}`] = "";
          v[`url-${2 + (i - 40) / 2}`] = "";
        }
      }
      v["text-50"] =
        locale === "ru"
          ? "В корзину"
          : locale === "lv"
            ? "Pievienot grozam"
            : "Add to bag";
      v["url-6"] = "#cart";
      if (!t.specs.length) v["heading-3"] = "";
      v["text-48"] = t.priceNote;
      v["heading-2"] = fmt(firstVariant?.price ?? product.price);
      v["text-49"] =
        !visibleVariants.length && product.oldPrice
          ? fmt(product.oldPrice)
          : "";
      pairs(v, 51, t.specs, LIMITS.specs);
      return { ...s, values: v };
    }
    if (s.variant === "hero-v20")
      return { ...s, values: { ...s.values, "text-3": t.name } };
    if (s.variant === "pricing-v25" && oldMain && s.collections)
      return {
        ...s,
        collections: Object.fromEntries(
          Object.entries(s.collections).map(([key, items]) => [
            key,
            items.map((item) => ({
              ...item,
              values: Object.fromEntries(
                Object.entries(item.values).map(([k, val]) => [
                  k,
                  k.startsWith("image-") && val === oldMain ? main : val,
                ]),
              ),
            })),
          ]),
        ),
      };
    return s;
  });
  return {
    ...snapshot,
    title: t.name,
    slug: t.slug,
    sections,
    seo: {
      ...snapshot.seo,
      title: t.seoTitle || t.name,
      description: (t.seoDescription || t.summary).replaceAll(
        "{price}",
        fmt(product.price),
      ),
      image: main,
    },
  };
}
