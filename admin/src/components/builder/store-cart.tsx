"use client";
// Cart window of a shop website in one of five layouts (drawer, modal, sheet, wide, full) with
// the opening/closing animation of cart.scss — the cart look from origin/main, put on top of
// our cart: the same lines as cart-widgets.ts (localStorage per website), and "Checkout" goes to
// the website's checkout page (pricing-v24), which sends a real order (/api/shop/orders).
// Opened by the header cart button (cart-widgets.ts dispatches cms:cart-open).
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Minus,
  Plus,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  X,
} from "lucide-react";
import { uiText } from "@/lib/builder/i18n";
import { safeUrl } from "@/lib/builder/safe-url";
import type { CartButton, CartVariant } from "@/lib/builder/types";
import {
  CART_CHANGE,
  CART_OPEN,
  cartKey,
  type CartLine,
} from "./cart-widgets";

const icons = { bag: ShoppingBag, cart: ShoppingCart, basket: ShoppingBasket };
// Icon or picture of the header cart button (settings preview).
export function CartSymbol({ button }: { button?: CartButton }) {
  const Icon = icons[button?.icon ?? "cart"];
  const image = safeUrl(button?.image || "", true);
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cart-trigger__image" src={image} alt="" width={22} height={22} />
  ) : (
    <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
  );
}

const money = (n: number, currency: string) =>
  `${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")} ${currency}`;

function readLines(key: string): CartLine[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.slice(0, 30) : [];
  } catch {
    return [];
  }
}

export function StoreCart({
  variant,
  siteId,
  locale,
  checkoutHref,
  demo,
}: {
  variant: CartVariant;
  siteId?: string;
  locale?: string;
  checkoutHref?: string;
  // Settings preview: sample lines kept in memory, no storage.
  demo?: CartLine[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const t = uiText(locale);
  const key = siteId ? cartKey(siteId) : "";
  const [lines, setLines] = useState<CartLine[]>(demo || []);
  const reload = useCallback(() => {
    if (!demo && key) setLines(readLines(key));
  }, [demo, key]);
  // Lines are read when the window opens and whenever the cart changes.
  useEffect(() => {
    const open = () => {
      reload();
      dialog.current?.showModal();
    };
    const storage = (e: StorageEvent) => e.key === key && reload();
    window.addEventListener(CART_OPEN, open);
    window.addEventListener(CART_CHANGE, reload);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(CART_OPEN, open);
      window.removeEventListener(CART_CHANGE, reload);
      window.removeEventListener("storage", storage);
    };
  }, [key, reload]);
  const save = (next: CartLine[]) => {
    setLines(next);
    if (demo || !key) return;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    window.dispatchEvent(new CustomEvent(CART_CHANGE));
  };
  const step = (i: number, change: number) =>
    save(
      lines.map((line, n) =>
        n === i ? { ...line, qty: Math.max(1, Math.min(20, line.qty + change)) } : line,
      ),
    );
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const sum = lines.reduce(
    (s, l) => s + (Number.isNaN(l.price) || l.price == null ? 0 : l.price * l.qty),
    0,
  );
  const currency = lines[0]?.currency || "€";
  const close = () => dialog.current?.close();
  return (
    <dialog
      ref={dialog}
      className={`store-cart store-cart--${variant}`}
      aria-labelledby={title}
      data-cart-count={count}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="store-cart__body">
        <div className="store-cart__header">
          <h2 className="heading heading--md" id={title}>
            {t.cart}
          </h2>
          <button className="store-cart__icon" type="button" aria-label={t.close} onClick={close}>
            <X size={22} />
          </button>
        </div>
        <div className="store-cart__content">
          {count === 0 ? (
            <div className="store-cart__empty">
              <ShoppingBag size={32} strokeWidth={1.25} aria-hidden="true" />
              <p className="heading heading--sm">{t.empty}</p>
            </div>
          ) : (
            <ul className="store-cart__items">
              {lines.map((line, i) => {
                const shown = line.options.filter(
                  (o, n) => o && !(n === 0 && o === line.name),
                );
                return (
                  <li key={`${line.sectionId}-${line.variantId||""}-${line.name}-${line.options.join("|")}`}>
                    {line.image && safeUrl(line.image, true) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="store-cart__photo" src={safeUrl(line.image, true)} alt="" width={88} height={110} />
                    ) : <ShoppingBag size={32} strokeWidth={1.25} aria-hidden="true" />}
                    <div>
                      <h3 className="heading heading--sm">{line.name}</h3>
                      {shown.length > 0 && (
                        <p className="text text--sm text--muted">{shown.join(" · ")}</p>
                      )}
                      <div className="store-cart__quantity">
                        <button
                          type="button"
                          className="store-cart__icon"
                          aria-label={`${t.quantity} −1`}
                          disabled={line.qty <= 1}
                          onClick={() => step(i, -1)}
                        >
                          <Minus size={16} />
                        </button>
                        <output aria-label={t.quantity}>{line.qty}</output>
                        <button
                          type="button"
                          className="store-cart__icon"
                          aria-label={`${t.quantity} +1`}
                          disabled={line.qty >= 20}
                          onClick={() => step(i, 1)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="store-cart__remove"
                        onClick={() => save(lines.filter((_, n) => n !== i))}
                      >
                        {t.remove}
                      </button>
                    </div>
                    <span className="text text--md">
                      {Number.isNaN(line.price) || line.price == null
                        ? ""
                        : money(line.price * line.qty, line.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="store-cart__footer">
          {count > 0 && (
            <p className="store-cart__total text text--lg" aria-live="polite">
              <strong>{t.total}</strong>
              <span>{money(sum, currency)}</span>
            </p>
          )}
          {count > 0 && checkoutHref && (
            <a className="button" href={checkoutHref}>
              {t.toCheckout}
            </a>
          )}
          <button className="button button--outline" type="button" onClick={close}>
            {t.keepBrowsing}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
