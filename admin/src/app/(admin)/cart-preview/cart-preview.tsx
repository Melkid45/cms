"use client";
// Try the five cart layouts with sample lines (settings → Shop cart → "Try this layout").
import { useEffect, useState } from "react";
import { StoreCart } from "@/components/builder/store-cart";
import { CART_OPEN, type CartLine } from "@/components/builder/cart-widgets";
import { cartVariants, type CartVariant } from "@/lib/builder/types";

const names: Record<CartVariant, string> = {
  drawer: "Side drawer",
  modal: "Centred dialog",
  sheet: "Bottom sheet",
  wide: "Wide dialog",
  full: "Full screen",
};
const sample: CartLine[] = [
  { pageId: "demo", sectionId: "chair", name: "Alder Chair", options: ["Oak"], qty: 1, price: 240, currency: "€" },
  { pageId: "demo", sectionId: "table", name: "Alder Table", options: [], qty: 2, price: 480, currency: "€" },
];
export function CartPreview({ initial }: { initial?: CartVariant }) {
  const [variant, setVariant] = useState<CartVariant>(initial || "drawer");
  const [opened, setOpened] = useState(0);
  useEffect(() => {
    if (opened) window.dispatchEvent(new CustomEvent(CART_OPEN));
  }, [opened]);
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {cartVariants.map((v) => (
          <button
            key={v}
            type="button"
            className={v === variant ? "button" : "button button--outline"}
            onClick={() => {
              setVariant(v);
              setOpened((n) => n + 1);
            }}
          >
            {names[v]}
          </button>
        ))}
      </div>
      <StoreCart key={variant} variant={variant} demo={sample} checkoutHref="#checkout" />
    </>
  );
}
