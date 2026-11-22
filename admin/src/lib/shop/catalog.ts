import type { CatalogSettings } from "@/lib/builder/types";
import type { Product } from "./types";
export const defaultCatalog: CatalogSettings = {
  enabled: false,
  variant: "grid",
  productPage: "split",
  productCard: "minimal",
  title: "Our collection",
  description: "Considered pieces for everyday living.",
  categories: true,
  availability: true,
  search: true,
  attributes: [],
};
export const available = (p: Product) =>
  p.manageStock ? p.stock > 0 : p.availability === "In stock";
export const sellingPrice = (p: Product) => p.salePrice ?? p.price;
export const formatPrice = (p: Product, price = sellingPrice(p)) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: p.currency,
  }).format(price / 100);
export function filterProducts(
  products: Product[],
  filters: {
    query: string;
    category: string;
    stock: boolean;
    attributes: Record<string, string>;
    sort: string;
  },
) {
  return products
    .filter(
      (p) =>
        p.status === "Published" &&
        (!filters.category || p.categories.includes(filters.category)) &&
        (!filters.stock || available(p)) &&
        (!filters.query ||
          `${p.name} ${p.summary} ${p.categories.join(" ")}`
            .toLowerCase()
            .includes(filters.query.toLowerCase())) &&
        Object.entries(filters.attributes).every(
          ([name, value]) =>
            !value ||
            p.attributes.some(
              (a) => a.name === name && a.values.includes(value),
            ),
        ),
    )
    .sort((a, b) =>
      filters.sort === "price-up"
        ? sellingPrice(a) - sellingPrice(b)
        : filters.sort === "price-down"
          ? sellingPrice(b) - sellingPrice(a)
          : filters.sort === "name"
            ? a.name.localeCompare(b.name)
            : b.createdAt.localeCompare(a.createdAt),
    );
}
