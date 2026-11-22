// Catalogue ⇄ table (CSV export, CSV/XLSX import). Client-safe: the import screen uses the
// same column list to offer the mapping.
import type { Locale } from "../i18n";
import { emptyText, slugify, STOCK, type Product, type ProductText, type Spec, type Stock } from "./shared";

const TEXT_COLUMNS: [string, keyof ProductText][] = [
  ["name", "name"],
  ["slug", "slug"],
  ["subtitle", "subtitle"],
  ["summary", "summary"],
  ["description", "description"],
  ["badge", "badge"],
  ["image_alt", "imageAlt"],
  ["price_note", "priceNote"],
  ["seo_title", "seoTitle"],
  ["seo_description", "seoDescription"],
  ["top_specs", "topSpecs"],
  ["card_specs", "cardSpecs"],
  ["specs", "specs"],
];
const BASE_COLUMNS = ["id", "sku", "category", "price", "old_price", "stock", "qty", "hidden", "images", "options"];
export function tableColumns(locales: string[], filterKeys: string[]) {
  return [
    ...BASE_COLUMNS,
    ...filterKeys.map((k) => `filter_${k}`),
    ...locales.flatMap((l) => TEXT_COLUMNS.map(([c]) => `${c}_${l}`)),
  ];
}
// Specification cells: one "Label: value" per line.
const specsCell = (list: Spec[]) => list.map((s) => `${s.key}: ${s.value}`).join("\n");
const parseSpecs = (cell: string): Spec[] =>
  cell
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(":");
      return at < 0 ? { key: line, value: "" } : { key: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    });
export function productRow(p: Product, columns: string[]): string[] {
  return columns.map((c) => {
    switch (c) {
      case "id": return p.id;
      case "sku": return p.sku;
      case "category": return p.category;
      case "price": return String(p.price);
      case "old_price": return p.oldPrice == null ? "" : String(p.oldPrice);
      case "stock": return p.stock;
      case "qty": return p.qty == null ? "" : String(p.qty);
      case "hidden": return p.hidden ? "yes" : "";
      case "images": return p.images.join("\n");
      case "options": return p.options.length ? JSON.stringify(p.options) : "";
    }
    if (c.startsWith("filter_")) return p.filters[c.slice(7)] || "";
    const m = c.match(/^(.+)_([a-z]{2})$/);
    const field = m && TEXT_COLUMNS.find(([name]) => name === m[1])?.[1];
    const text = m && p.text[m[2] as Locale];
    if (!field || !text) return "";
    const value = text[field];
    return Array.isArray(value) ? specsCell(value) : value;
  });
}
export function toCsv(rows: string[][]) {
  // A cell that starts like a formula gets a ' so a spreadsheet never runs it (removed on import).
  const cell = (raw: string) => {
    const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n\r;]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  };
  // BOM: Excel opens UTF-8 (Latvian/Russian letters) correctly.
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
// CSV with comma, semicolon or tab (detected from the first line), quoted cells, line breaks in cells.
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const head = source.split(/\r?\n/, 1)[0] || "";
  const delimiter = [",", ";", "\t"].sort((a, b) => head.split(b).length - head.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
// Column guess for an imported header: export names first, then common names in LV/RU/EN.
const ALIASES: Record<string, string> = {
  code: "sku", kods: "sku", artikuls: "sku", "артикул": "sku", "код": "sku", article: "sku",
  cena: "price", "цена": "price", "old price": "old_price", "vecā cena": "old_price", "старая цена": "old_price",
  kategorija: "category", "категория": "category", quantity: "qty", daudzums: "qty", "количество": "qty",
  noliktavā: "stock", "наличие": "stock", availability: "stock", image: "images", photo: "images", attēls: "images", "фото": "images",
};
export function guessColumn(header: string, columns: string[], defaultLocale: string) {
  const h = header.trim().toLowerCase().replace(/\s+/g, " ");
  const plain = h.replace(/ /g, "_");
  if (columns.includes(plain)) return plain;
  if (ALIASES[h] && columns.includes(ALIASES[h])) return ALIASES[h];
  const named: Record<string, string> = { name: "name", title: "name", nosaukums: "name", "название": "name", description: "description", apraksts: "description", "описание": "description" };
  if (named[h] && columns.includes(`${named[h]}_${defaultLocale}`)) return `${named[h]}_${defaultLocale}`;
  return "";
}
// One imported row → changes to apply on top of the matched (or a new) product.
export interface RowChange {
  match: { id?: string; sku?: string; slug?: string };
  set: Partial<Pick<Product, "sku" | "category" | "price" | "oldPrice" | "stock" | "qty" | "hidden" | "images" | "options">>;
  filters: Record<string, string>;
  text: Partial<Record<Locale, Partial<ProductText>>>;
  errors: string[];
}
const number = (v: string) => {
  const n = Number(v.replace(/[\s €]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const STOCK_WORDS: Record<string, Stock> = {
  yes: "in_stock", "in stock": "in_stock", ir: "in_stock", "есть": "in_stock", "в наличии": "in_stock",
  "to order": "to_order", "pasūtāms": "to_order", "под заказ": "to_order",
  no: "out_of_stock", "out of stock": "out_of_stock", nav: "out_of_stock", "нет": "out_of_stock",
};
export function rowChange(row: string[], mapping: string[], defaultLocale: string): RowChange {
  const change: RowChange = { match: {}, set: {}, filters: {}, text: {}, errors: [] };
  mapping.forEach((column, i) => {
    if (!column) return;
    const value = (row[i] ?? "").trim().replace(/^'(?=[=+\-@])/, "");
    const m = column.match(/^(.+)_([a-z]{2})$/);
    const textField = m && TEXT_COLUMNS.find(([name]) => name === m[1])?.[1];
    if (textField) {
      const t = (change.text[m![2] as Locale] ??= {});
      (t as Record<string, unknown>)[textField] = ["topSpecs", "cardSpecs", "specs"].includes(textField) ? parseSpecs(value) : value;
      if (textField === "slug" && m![2] === defaultLocale && value) change.match.slug = value;
      return;
    }
    if (column.startsWith("filter_")) {
      change.filters[column.slice(7)] = value;
      return;
    }
    switch (column) {
      case "id":
        if (value) change.match.id = value;
        break;
      case "sku":
        change.set.sku = value;
        if (value) change.match.sku = value;
        break;
      case "category":
        change.set.category = value;
        break;
      case "price":
      case "old_price": {
        const n = value ? number(value) : null;
        if (n !== null && (Number.isNaN(n) || n < 0)) change.errors.push(`${column}: "${value}" is not a price`);
        else if (column === "price") {
          if (n === null) change.errors.push("price is empty");
          else change.set.price = n;
        } else change.set.oldPrice = n;
        break;
      }
      case "qty": {
        const n = value ? Math.round(number(value)) : null;
        if (n !== null && (Number.isNaN(n) || n < 0)) change.errors.push(`qty: "${value}" is not a number`);
        else change.set.qty = n;
        break;
      }
      case "stock": {
        const s = (STOCK as readonly string[]).includes(value) ? (value as Stock) : STOCK_WORDS[value.toLowerCase()];
        if (value && !s) change.errors.push(`stock: "${value}" (use in_stock, to_order or out_of_stock)`);
        else if (s) change.set.stock = s;
        break;
      }
      case "hidden":
        change.set.hidden = /^(yes|true|1|jā|да|hidden)$/i.test(value);
        break;
      case "images":
        change.set.images = value.split(/[\n|]+/).map((s) => s.trim()).filter(Boolean);
        break;
      case "options":
        if (!value) change.set.options = [];
        else
          try {
            change.set.options = JSON.parse(value);
          } catch {
            change.errors.push("options: not valid JSON (export a product to see the format)");
          }
        break;
    }
  });
  return change;
}
// Matched product (or a new one) with the row's changes; slugs of new languages from the name.
export function mergeChange(base: Product | undefined, change: RowChange) {
  const text: Product["text"] = structuredClone(base?.text || {});
  for (const [locale, t] of Object.entries(change.text) as [Locale, Partial<ProductText>][]) {
    const next = { ...emptyText(), ...text[locale], ...t };
    if (!next.name && !base?.text[locale]) continue;
    if (!next.slug && next.name) next.slug = slugify(next.name);
    text[locale] = next;
  }
  return {
    sku: base?.sku ?? "",
    category: base?.category ?? "",
    price: base?.price ?? 0,
    oldPrice: base?.oldPrice ?? null,
    stock: base?.stock ?? "in_stock",
    qty: base?.qty ?? null,
    images: base?.images ?? [],
    hidden: base?.hidden ?? false,
    options: base?.options ?? [],
    pages: base?.pages ?? {},
    ...change.set,
    filters: Object.fromEntries(Object.entries({ ...base?.filters, ...change.filters }).filter(([, v]) => v)),
    text,
  };
}
