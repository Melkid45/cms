"use client";
import { useMemo, useSyncExternalStore } from "react";
import { cartLimit } from "./cart-types";
const key = "harbstone-cart-v2";
const event = "harbstone-cart-change";
let memory = "{}";
export function parseCart(value: string): Record<string, number> {
  try {
    const data = JSON.parse(value);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data)
        .filter(
          ([id, quantity]) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              id,
            ) &&
            Number.isInteger(quantity) &&
            Number(quantity) > 0 &&
            Number(quantity) <= cartLimit,
        )
        .slice(0, 100),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}
function snapshot() {
  try {
    return localStorage.getItem(key) || memory;
  } catch {
    return memory;
  }
}
function subscribe(notify: () => void) {
  const storage = (e: StorageEvent) => {
    if (!e.key || e.key === key) {
      memory = "{}";
      notify();
    }
  };
  window.addEventListener(event, notify);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(event, notify);
    window.removeEventListener("storage", storage);
  };
}
export function useCartItems() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "{}");
  return useMemo(() => parseCart(raw), [raw]);
}
export function setCartQuantity(id: string, quantity: number) {
  const items = parseCart(snapshot());
  if (quantity > 0) items[id] = Math.min(cartLimit, Math.floor(quantity));
  else delete items[id];
  memory = JSON.stringify(items);
  try {
    localStorage.setItem(key, memory);
  } catch {}
  window.dispatchEvent(new Event(event));
}
export function addCartItem(id: string, limit: number) {
  const items = parseCart(snapshot());
  if (!(id in items) && Object.keys(items).length >= 100) return false;
  const quantity = items[id] || 0;
  if (quantity >= limit) return false;
  setCartQuantity(id, quantity + 1);
  return true;
}
export function reconcileCart(
  expected: Record<string, number>,
  next: Record<string, number>,
) {
  if (JSON.stringify(parseCart(snapshot())) !== JSON.stringify(expected))
    return;
  if (JSON.stringify(expected) === JSON.stringify(next)) return;
  memory = JSON.stringify(next);
  try {
    localStorage.setItem(key, memory);
  } catch {}
  window.dispatchEvent(new Event(event));
}
