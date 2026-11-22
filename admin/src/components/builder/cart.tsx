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
import {
  useCartItems,
  setCartQuantity,
  reconcileCart,
} from "@/lib/shop/cart-client";
import type { CartResult } from "@/lib/shop/cart-types";
import type { CartButton, CartVariant } from "@/lib/builder/types";

const demoProducts = [
  {
    id: "chair",
    name: "Alder Chair",
    image: "/images/alder-chair.jpg",
    price: 24000,
    currency: "GBP",
    limit: 99,
  },
  {
    id: "table",
    name: "Alder Table",
    image: "/images/alder-table.jpg",
    price: 48000,
    currency: "GBP",
    limit: 99,
  },
];
const format = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    minor / 100,
  );

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
  const [demoItems, setDemoItems] = useState<Record<string, number>>({});
  const stored = useCartItems();
  const [quote, setQuote] = useState<CartResult>({
    items: [],
    adjusted: false,
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(!demo);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    async function load() {
      setPending(true);
      setError("");
      try {
        const response = await fetch("/api/shop/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stored),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not update the cart.");
        if (controller.signal.aborted) return;
        setQuote(data);
        if (data.adjusted)
          setNotice("Your cart was updated to match current availability.");
        reconcileCart(
          stored,
          Object.fromEntries(
            (data as CartResult).items.map((item) => [item.id, item.quantity]),
          ),
        );
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not update the cart.",
          );
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [stored, demo, refresh]);
  const products = demo ? demoProducts : quote.items;
  const items = demo
    ? demoItems
    : Object.fromEntries(quote.items.map((item) => [item.id, item.quantity]));
  function quantity(id: string, change: number) {
    const product = products.find((item) => item.id === id);
    const value = Math.max(
      0,
      Math.min(product?.limit ?? 99, (items[id] || 0) + change),
    );
    if (demo) setDemoItems((current) => ({ ...current, [id]: value }));
    else setCartQuantity(id, value);
  }
  const count = products.reduce((sum, item) => sum + (items[item.id] || 0), 0);
  const totals = products.reduce<Record<string, number>>(
    (sum, item) => ({
      ...sum,
      [item.currency]:
        (sum[item.currency] || 0) + item.price * (items[item.id] || 0),
    }),
    {},
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
        onClick={() => {
          setRefresh((value) => value + 1);
          dialog.current?.showModal();
        }}
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
          <div className="store-cart__content" aria-busy={pending}>
            {error && (
              <p role="alert">
                {error}{" "}
                <button
                  type="button"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  Retry
                </button>
              </p>
            )}
            {notice && (
              <p role="status" className="text text--sm">
                {notice}
              </p>
            )}
            {pending && (
              <p role="status" className="text text--sm">
                Updating cart…
              </p>
            )}
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
                        {item.image ? (
                          <img src={item.image} alt="" width={80} height={80} />
                        ) : (
                          <ShoppingBag size={32} aria-hidden="true" />
                        )}
                        <div>
                          <h3 className="heading heading--sm">{item.name}</h3>
                          <div className="store-cart__quantity">
                            <button
                              type="button"
                              className="store-cart__icon"
                              disabled={pending && !demo}
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
                              disabled={
                                (pending && !demo) ||
                                items[item.id] >= item.limit
                              }
                              onClick={() => quantity(item.id, 1)}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="store-cart__remove"
                            aria-label={`Remove ${item.name}`}
                            disabled={pending && !demo}
                            onClick={() => quantity(item.id, -items[item.id])}
                          >
                            Remove
                          </button>
                        </div>
                        <span className="text text--md">
                          {format(item.price * items[item.id], item.currency)}
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
                <span>
                  {Object.entries(totals).map(([currency, total]) => (
                    <span className="store-cart__currency" key={currency}>
                      {format(total, currency)}
                    </span>
                  ))}
                </span>
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
