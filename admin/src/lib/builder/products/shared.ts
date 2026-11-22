// Product catalogue of a shop website (Dashboard → Catalog). Client-safe types and helpers.
// Products live in one document per website (`catalog:{siteId}`, products/store.ts). Public pages
// read them through products/apply.ts: product pages, catalogue grids (pricing-v21) and product
// cards (pricing-v20) are filled from this data on every request.
import type { Locale } from "../i18n";
import type { Project } from "../types";

export const STOCK = ["in_stock", "to_order", "out_of_stock"] as const;
export type Stock = (typeof STOCK)[number];
export const STOCK_LABELS: Record<Stock, string> = {
  in_stock: "In stock",
  to_order: "To order",
  out_of_stock: "Out of stock",
};
export interface Spec {
  key: string;
  value: string;
}
// Texts of a product in one language.
export interface ProductText {
  name: string;
  slug: string;
  // Short line above the name on the product page (e.g. "AMD · AM5").
  subtitle: string;
  // One-line summary under the name.
  summary: string;
  // Longer description (search results, SEO fallback, export).
  description: string;
  imageAlt: string;
  // Card badge ("Top", "New"); empty = none.
  badge: string;
  // Line next to the price on the product page.
  priceNote: string;
  seoTitle: string;
  // "{price}" is replaced with the current price.
  seoDescription: string;
  // Four rows next to the photo on the product page.
  topSpecs: Spec[];
  // Four rows on product cards.
  cardSpecs: Spec[];
  // Specification table (up to 12 rows).
  specs: Spec[];
}
export interface ProductOption {
  label: Partial<Record<Locale, string>>;
  // Two choices per group on the product page; delta = surcharge in EUR (0 = included).
  choices: { name: Partial<Record<Locale, string>>; delta: number }[];
}
export interface Product {
  id: string;
  sku: string;
  category: string;
  price: number;
  oldPrice: number | null;
  stock: Stock;
  qty: number | null;
  // Media library URLs; the first one is the main photo.
  images: string[];
  hidden: boolean;
  // Filter values by filter key (Settings → filters), the same in every language.
  filters: Record<string, string>;
  options: ProductOption[];
  text: Partial<Record<Locale, ProductText>>;
  // Existing website pages that show this product (per language). Without one the page is
  // built from the template page of that language.
  pages: Partial<Record<Locale, string>>;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export interface CatalogSettings {
  // Product page used as the pattern for products without their own page, per language.
  templates: Partial<Record<Locale, string>>;
  // Up to four filter groups (chip groups of the catalogue block, in order).
  filters: { key: string; label: string }[];
  // "{n} €" → "1199 €".
  priceFormat: string;
  // Text of a surcharge-free option ("Included"), per language.
  includedLabel: Partial<Record<Locale, string>>;
  categories: string[];
}
export interface Catalog {
  revision: number;
  settings: CatalogSettings;
  products: Product[];
  // Old addresses of products whose URL changed (redirected to the product's page).
  moved: { from: string; productId: string; locale: string }[];
  // Pages of deleted products: no longer public (404).
  retired: string[];
}
export const emptyCatalog = (): Catalog => ({
  revision: 0,
  settings: {
    templates: {},
    filters: [],
    priceFormat: "{n} €",
    includedLabel: {},
    categories: [],
  },
  products: [],
  moved: [],
  retired: [],
});
export const emptyText = (): ProductText => ({
  name: "",
  slug: "",
  subtitle: "",
  summary: "",
  description: "",
  imageAlt: "",
  badge: "",
  priceNote: "",
  seoTitle: "",
  seoDescription: "",
  topSpecs: [],
  cardSpecs: [],
  specs: [],
});
export const LIMITS = { topSpecs: 4, cardSpecs: 4, specs: 12, options: 5, choices: 2, images: 5, filters: 4 };

export function formatPrice(n: number, format = "{n} €") {
  const value = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return (format.includes("{n}") ? format : "{n} €").replace("{n}", value);
}
// "−12%" when the old price is higher.
export function discountLabel(price: number, oldPrice: number | null) {
  return oldPrice && oldPrice > price ? `−${Math.round((1 - price / oldPrice) * 100)}%` : "";
}
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "j", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
// URL part from a name: lower case, Latin letters (Latvian/Cyrillic transliterated), digits, dashes.
export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => TRANSLIT[c] ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/, "");
}
// Languages products are written in: the website's languages (default first), else the home page's.
export function catalogLocales(project: Pick<Project, "languages" | "pages" | "layout">): string[] {
  const l = project.languages;
  if (l?.enabled.length) return [l.default, ...l.enabled.filter((x) => x !== l.default)];
  return [project.pages.find((p) => p.id === project.layout.homePageId)?.locale || "en"];
}
export const productName =(p: Product, locale?: string) =>
  (locale && p.text[locale as Locale]?.name) ||
  Object.values(p.text).find((t) => t?.name)?.name ||
  p.sku ||
  "Untitled product";
