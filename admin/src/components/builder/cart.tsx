"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useRef, useState } from "react";
import {
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  ShoppingBasket,
  X,
} from "lucide-react";
import { safeUrl } from "@/lib/builder/catalog";
import type { CartButton, CartVariant } from "@/lib/builder/types";

const products = [
  {
    id: "chair",
    name: "Alder Chair",
    image: "/images/alder-chair.jpg",
    price: 24000,
  },
  {
    id: "table",
    name: "Alder Table",
    image: "/images/alder-table.jpg",
    price: 48000,
  },
];
const storageKey = "harbstone-cart-v1";
const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const format = (minor: number) => money.format(minor / 100);

const icons = { bag: ShoppingBag, cart: ShoppingCart, basket: ShoppingBasket };

export function CartSymbol({ button }: { button?: CartButton }) {
  const Icon = icons[button?.icon ?? "bag"];
  const image = safeUrl(button?.image || "", true);
  return image ? (
    <img
      className="cart-trigger__image"
      src={image}
      alt=""
      width={22}
      height={22}
    />
  ) : (
    <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
  );
}

export function Cart({
  variant,
  demo = false,
  button,
}: {
  variant: CartVariant;
  demo?: boolean;
  button?: CartButton;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [items, setItems] = useState<Record<string, number>>({});
  useEffect(() => {
    if (demo) return;
    function restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
        setItems(
          Object.fromEntries(
            products.map(({ id }) => {
              const value = saved?.[id];
              return [
                id,
                Number.isInteger(value) && value >= 0 && value <= 99
                  ? value
                  : 0,
              ];
            }),
          ),
        );
      } catch {
        setItems({});
      }
    }
    restore();
    window.addEventListener("storage", restore);
    return () => window.removeEventListener("storage", restore);
  }, [demo]);
  function quantity(id: string, change: number) {
    const next = {
      ...items,
      [id]: Math.max(0, Math.min(99, (items[id] || 0) + change)),
    };
    setItems(next);
    if (!demo) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
    }
  }
  const count = products.reduce((sum, item) => sum + (items[item.id] || 0), 0);
  const total = products.reduce(
    (sum, item) => sum + item.price * (items[item.id] || 0),
    0,
  );

  return (
    <>
      {demo && (
        <div className="actions">
          {products.map((item) => (
            <button
              key={item.id}
              className="button button--outline"
              type="button"
              onClick={() => quantity(item.id, 1)}
            >
              Add {item.name}
            </button>
          ))}
        </div>
      )}
      <button
        className="cart-trigger"
        type="button"
        aria-label={`Open cart, ${count} items`}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <CartSymbol button={button} />
        {button?.label && <span>{button.label}</span>}
        {count > 0 && (
          <span className="cart-trigger__count" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        className={`store-cart store-cart--${variant}`}
        aria-labelledby={title}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="store-cart__body">
          <div className="store-cart__header">
            <h2 className="heading heading--md" id={title}>
              Your cart
            </h2>
            <button
              className="store-cart__icon"
              type="button"
              aria-label="Close cart"
              onClick={() => dialog.current?.close()}
            >
              <X size={22} />
            </button>
          </div>
          <div className="store-cart__content">
            {count === 0 ? (
              <div className="store-cart__empty">
                <ShoppingBag size={32} strokeWidth={1.25} aria-hidden="true" />
                <p className="heading heading--sm">Your cart is empty.</p>
              </div>
            ) : (
              <>
                <ul className="store-cart__items">
                  {products
                    .filter((item) => items[item.id] > 0)
                    .map((item) => (
                      <li key={item.id}>
                        <img src={item.image} alt="" width={80} height={80} />
                        <div>
                          <h3 className="heading heading--sm">{item.name}</h3>
                          <div className="store-cart__quantity">
                            <button
                              type="button"
                              className="store-cart__icon"
                              aria-label={`Decrease ${item.name} quantity`}
                              onClick={() => quantity(item.id, -1)}
                            >
                              <Minus size={16} />
                            </button>
                            <output aria-label={`${item.name} quantity`}>
                              {items[item.id]}
                            </output>
                            <button
                              type="button"
                              className="store-cart__icon"
                              aria-label={`Increase ${item.name} quantity`}
                              disabled={items[item.id] >= 99}
                              onClick={() => quantity(item.id, 1)}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="store-cart__remove"
                            onClick={() => quantity(item.id, -items[item.id])}
                          >
                            Remove {item.name}
                          </button>
                        </div>
                        <span className="text text--md">
                          {format(item.price * items[item.id])}
                        </span>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
          <footer className="store-cart__footer">
            {count > 0 && (
              <p className="store-cart__total text text--lg" aria-live="polite">
                <strong>Subtotal</strong>
                <span>{format(total)}</span>
              </p>
            )}
            <button
              className="button button--outline"
              type="button"
              onClick={() => dialog.current?.close()}
            >
              Continue browsing
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
