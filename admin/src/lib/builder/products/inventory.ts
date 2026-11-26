import { StoreError } from "../server";
import {
  availableQty,
  type Catalog,
  type Product,
  type ProductVariant,
} from "./shared";
export type InventoryState = "reserved" | "committed" | "released";
export interface Allocation {
  productId: string;
  variantId?: string;
  qty: number;
  tracked: boolean;
}
export interface Inventory {
  state: InventoryState;
  allocations: Allocation[];
}
export interface InventoryLine {
  productId?: string;
  variantId?: string;
  qty: number;
  basePrice?: number;
  name: string;
}
const targetOf = (
  catalog: Catalog,
  item: Pick<Allocation, "productId" | "variantId">,
) => {
  const product = catalog.products.find((p) => p.id === item.productId);
  const target = item.variantId
    ? product?.variants?.find((v) => v.id === item.variantId)
    : product;
  return { product, target };
};
const touch = (catalog: Catalog, product: Product) => {
  product.revision++;
  product.updatedAt = new Date().toISOString();
  catalog.revision++;
};
export function reserveInventory(
  catalog: Catalog,
  lines: InventoryLine[],
): Inventory {
  const allocations: Allocation[] = [];
  for (const line of lines) {
    if (!line.productId) continue; // Unconnected legacy/configurator blocks remain untracked.
    const { product, target } = targetOf(catalog, {
      productId: line.productId,
      variantId: line.variantId,
    });
    if (
      !product ||
      product.hidden ||
      !target ||
      target.hidden ||
      target.stock === "out_of_stock" ||
      (!line.variantId && product.variants?.length)
    )
      throw new StoreError(
        `"${line.name}" is no longer available. Update your cart.`,
        409,
      );
    if (line.basePrice !== undefined && line.basePrice !== target.price)
      throw new StoreError(
        `The price of "${line.name}" has changed. Update your cart.`,
        409,
      );
    const tracked = target.qty !== null && target.stock !== "to_order";
    if (tracked && (availableQty(target) || 0) < line.qty)
      throw new StoreError(
        `Not enough stock for "${line.name}". Update the quantity in your cart.`,
        409,
      );
    if (tracked) {
      target.reserved = (target.reserved || 0) + line.qty;
      touch(catalog, product);
    }
    allocations.push({
      productId: product.id,
      ...(line.variantId ? { variantId: line.variantId } : {}),
      qty: line.qty,
      tracked,
    });
  }
  return { state: "reserved", allocations };
}
// All adjustments run in the SAME transaction as the order state change.
export function moveInventory(
  catalog: Catalog,
  inventory: Inventory,
  next: InventoryState,
) {
  const before = inventory.state;
  if (before === next) return;
  for (const item of inventory.allocations) {
    if (!item.tracked) continue;
    const { product, target } = targetOf(catalog, item);
    // Deleted completed products have no stock record to restore; history remains intact.
    if (!target || !product) {
      if (next !== "released")
        throw new StoreError("An ordered product no longer exists.", 409);
      continue;
    }
    if (before === "reserved")
      target.reserved = Math.max(0, (target.reserved || 0) - item.qty);
    if (before === "committed" && target.qty !== null) target.qty += item.qty;
    if (next !== "released") {
      if (target.qty === null)
        throw new StoreError(
          "Restore quantity tracking before reopening this order.",
          409,
        );
      if (
        (availableQty(target) || 0) < item.qty ||
        (before === "released" &&
          (target.stock === "out_of_stock" || product.hidden || target.hidden))
      )
        throw new StoreError("Not enough stock to reopen this order.", 409);
      if (next === "reserved")
        target.reserved = (target.reserved || 0) + item.qty;
      else target.qty -= item.qty;
    }
    touch(catalog, product);
  }
  inventory.state = next;
}
export function preserveReserves(
  before: Product | undefined,
  variants: ProductVariant[],
) {
  return variants.map((variant) => ({
    ...variant,
    reserved: before?.variants?.find((v) => v.id === variant.id)?.reserved || 0,
  }));
}
