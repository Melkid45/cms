import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { database, dataDirectory, StoreError } from "@/lib/builder/server";
import { safeUrl } from "@/lib/builder/catalog";
import type { Product } from "./types";

const image = z
  .string()
  .max(2000)
  .refine((value) => !value || !!safeUrl(value, true), "Choose a valid image.");
const money = z.number().int().min(0).max(999999999);
const schema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(160)
      .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u),
    sku: z.string().trim().max(100),
    status: z.enum(["Draft", "Published", "Archived"]),
    description: z.string().max(50000),
    summary: z.string().max(2000),
    images: z.array(image).max(20),
    price: money,
    salePrice: money.nullable(),
    currency: z.enum(["GBP", "USD", "EUR", "RUB"]),
    manageStock: z.boolean(),
    stock: z.number().int().min(0).max(10000000),
    availability: z.enum(["In stock", "Out of stock"]),
    categories: z.array(z.string().trim().min(1).max(100)).max(30),
    attributes: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            values: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
          })
          .strict(),
      )
      .max(30),
    weight: z.string().trim().max(100),
    dimensions: z.string().trim().max(100),
    seo: z
      .object({
        title: z.string().max(300),
        description: z.string().max(1000),
        image,
      })
      .strict(),
    createdAt: z.string().max(50),
    updatedAt: z.string().max(50),
  })
  .strict()
  .refine(
    (product) =>
      product.salePrice === null || product.salePrice < product.price,
    {
      message: "Sale price must be lower than the regular price.",
    },
  )
  .refine(
    (product) =>
      new Set(
        product.attributes.map((attribute) => attribute.name.toLowerCase()),
      ).size === product.attributes.length,
    {
      message: "Each attribute needs a unique name.",
    },
  );

type Inventory = { items: Product[] };
const queue = globalThis as typeof globalThis & {
  productsQueue?: Promise<unknown>;
};

async function inventory<T>(
  operation: (data: Inventory) => T,
  write = false,
): Promise<T> {
  const sql = await database();
  if (sql)
    return (await sql.begin(async (tx) => {
      await tx`INSERT INTO harbstone_project(id,document) VALUES ('products',${tx.json({ items: [] })}) ON CONFLICT DO NOTHING`;
      const [row] =
        await tx`SELECT document FROM harbstone_project WHERE id='products' FOR UPDATE`;
      const result = operation(row.document as Inventory);
      if (write)
        await tx`UPDATE harbstone_project SET document=${tx.json(row.document)} WHERE id='products'`;
      return result;
    })) as T;
  if (process.env.VERCEL)
    throw new StoreError("Product storage is not configured.", 503);
  const pending = (queue.productsQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const file = path.join(dataDirectory, "products.json");
      let data: Inventory;
      try {
        data = JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        data = { items: [] };
      }
      const result = operation(data);
      if (write) {
        await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
        await writeFile(file + ".tmp", JSON.stringify(data), { mode: 0o600 });
        await rename(file + ".tmp", file);
      }
      return result;
    });
  queue.productsQueue = pending;
  return pending;
}

export const listProducts = () =>
  inventory((data) =>
    [...data.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );

export function saveProduct(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new StoreError(
      parsed.error.issues[0]?.message || "Check product fields.",
      400,
    );
  return inventory((data) => {
    const product = parsed.data;
    const index = data.items.findIndex((item) => item.id === product.id);
    const previous = data.items[index];
    if ((previous?.revision ?? 0) !== product.revision)
      throw new StoreError(
        "This product was changed elsewhere. Reload before saving.",
        409,
      );
    if (
      data.items.some(
        (item) => item.id !== product.id && item.slug === product.slug,
      )
    )
      throw new StoreError("This slug belongs to another product.", 409);
    if (
      product.sku &&
      data.items.some(
        (item) =>
          item.id !== product.id &&
          item.sku.toLowerCase() === product.sku.toLowerCase(),
      )
    )
      throw new StoreError("This SKU belongs to another product.", 409);
    if (!previous && data.items.length >= 5000)
      throw new StoreError("The product limit has been reached.", 400);
    const now = new Date().toISOString();
    const saved: Product = {
      ...product,
      categories: [...new Set(product.categories)],
      images: [...new Set(product.images.filter(Boolean))],
      revision: product.revision + 1,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
    if (previous) data.items[index] = saved;
    else data.items.unshift(saved);
    return saved;
  }, true);
}
