"use client";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { addCartItem, useCartItems } from "@/lib/shop/cart-client";
export function AddToCart({
  id,
  name,
  limit,
}: {
  id: string;
  name: string;
  limit: number;
}) {
  const items = useCartItems();
  const [notice, setNotice] = useState("");
  const full = (items[id] || 0) >= limit;
  return (
    <div className="store-add">
      <button
        type="button"
        className="button button--outline"
        disabled={limit === 0 || full}
        aria-label={`Add ${name} to cart`}
        onClick={() =>
          setNotice(
            addCartItem(id, limit)
              ? "Added to cart."
              : "The cart limit has been reached.",
          )
        }
      >
        <ShoppingBag size={18} strokeWidth={1.5} />
        {limit === 0
          ? "Out of stock"
          : full
            ? "Maximum quantity added"
            : "Add to cart"}
      </button>
      <span className="store-add__notice text text--sm" role="status">
        {notice}
      </span>
    </div>
  );
}
