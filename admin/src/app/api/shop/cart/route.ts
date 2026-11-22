import { z } from "zod";
import { readProject, errorResponse, StoreError } from "@/lib/builder/server";
import { listProducts } from "@/lib/shop/products";
import { available, sellingPrice } from "@/lib/shop/catalog";
import { cartLimit, type CartItem } from "@/lib/shop/cart-types";
export const runtime = "nodejs";
const schema = z
  .record(z.uuid(), z.number().int().min(1).max(cartLimit))
  .refine((items) => Object.keys(items).length <= 100);
// Read-only quote: only IDs and quantities come from the browser; prices never do.
export async function POST(request: Request) {
  try {
    if (!(await readProject()).store?.enabled)
      throw new StoreError("The store is unavailable.", 404);
    const text = await request.text();
    if (text.length > 12000)
      throw new StoreError("The cart is too large.", 400);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new StoreError("Invalid cart.", 400);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new StoreError("Invalid cart.", 400);
    const products = new Map(
      (await listProducts())
        .filter((p) => p.status === "Published")
        .map((p) => [p.id, p]),
    );
    const items: CartItem[] = [];
    let adjusted = false;
    for (const [id, wanted] of Object.entries(parsed.data)) {
      const product = products.get(id);
      if (!product || !available(product)) {
        adjusted = true;
        continue;
      }
      const limit = product.manageStock
        ? Math.min(cartLimit, product.stock)
        : cartLimit;
      const quantity = Math.min(wanted, limit);
      if (quantity !== wanted) adjusted = true;
      items.push({
        id,
        name: product.name,
        slug: product.slug,
        image: product.images[0] || "",
        price: sellingPrice(product),
        currency: product.currency,
        quantity,
        limit,
      });
    }
    return Response.json(
      { items, adjusted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
