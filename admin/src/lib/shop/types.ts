export interface Product {
  id: string;
  revision: number;
  name: string;
  slug: string;
  sku: string;
  status: "Draft" | "Published" | "Archived";
  description: string;
  summary: string;
  images: string[];
  price: number;
  salePrice: number | null;
  currency: "GBP" | "USD" | "EUR" | "RUB";
  manageStock: boolean;
  stock: number;
  availability: "In stock" | "Out of stock";
  categories: string[];
  attributes: { name: string; values: string[] }[];
  weight: string;
  dimensions: string;
  seo: { title: string; description: string; image: string };
  createdAt: string;
  updatedAt: string;
}

export function emptyProduct(): Product {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    name: "",
    slug: "",
    sku: "",
    status: "Draft",
    description: "",
    summary: "",
    images: [],
    price: 0,
    salePrice: null,
    currency: "GBP",
    manageStock: false,
    stock: 0,
    availability: "In stock",
    categories: [],
    attributes: [],
    weight: "",
    dimensions: "",
    seo: { title: "", description: "", image: "" },
    createdAt: "",
    updatedAt: "",
  };
}

export function productSlug(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}
