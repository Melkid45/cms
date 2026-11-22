// Shop cart of a published website (no online payment). Kept in the visitor's browser
// (localStorage, per website); the server prices every order again from the published pages.
//  - "Order" buttons of product cards (pricing-v20/v21), the product page (pricing-v22) and the
//    configurator (pricing-v23) add the chosen product to the cart;
//  - every header gets a cart link with the item count (to the checkout page);
//  - the checkout block (pricing-v24) lists the cart and sends a real order to /api/shop/orders.
// Works only on public pages of a website that has a published checkout page.
// With the website setting "Instant checkout popup" (store.checkout = "popup") there is no cart:
// order buttons open checkout-popup.ts for that one product and no header cart link is added.
import { uiText } from "@/lib/builder/i18n";
import { closeCheckoutPopup, openCheckoutPopup, popupItem } from "./checkout-popup";
import { safeUrl } from "@/lib/builder/safe-url";
import type { CartButton, CartVariant } from "@/lib/builder/types";

// Cart window look (project.store, merged from origin/main): the header button opens the cart
// window (store-cart.tsx) instead of going to the checkout page. Both share the same storage.
export type CartLook = { variant: CartVariant; button?: CartButton };
export const CART_OPEN = "cms:cart-open";
export const CART_CHANGE = "cms:cart-change";
export const cartKey = (siteId: string) => `harbstone-cart:${siteId}`;
const ICONS: Record<CartButton["icon"], string> = {
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2l1.6-6.8H6.2"/>',
  basket: '<path d="m15 11-1 9"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"/><path d="M4.5 15.5h15"/><path d="m5 11 4-7"/><path d="m9 11 1 9"/>',
};
export function cartIconSvg(icon: CartButton["icon"] = "cart") {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon] || ICONS.cart}</svg>`;
}

export interface CartLine {
  pageId: string;
  sectionId: string;
  name: string;
  options: string[];
  qty: number;
  // Shown in the cart only; the server recomputes the price.
  price: number;
  currency: string;
}
const num = (text: string | null | undefined) => {
  const m = (text || "").replace(/[\s ]/g, "").replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : NaN;
};
const currencyOf = (text: string | null | undefined) =>
  (text || "").match(/[€$£]|EUR|USD|GBP/)?.[0] || "€";
const money = (n: number, currency: string) =>
  `${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")} ${currency}`;
const textOf = (el: Element | null | undefined) =>
  (el?.textContent || "").replace(/\s+/g, " ").trim();

export function mountCartWidgets(
  el: HTMLElement,
  signal: AbortSignal,
  options: {
    siteId?: string;
    pageId?: string;
    locale?: string;
    checkout?: { id: string; href: string };
    look?: CartLook;
    // Instant checkout popup instead of the cart (project.store.checkout = "popup").
    popup?: boolean;
  },
) {
  const { siteId, pageId, checkout, look, popup } = options;
  if (!siteId || !pageId || (!checkout && !popup)) return () => {};
  // Display currency switcher of the header "EUR €" pill (shops only; the cart and orders stay in EUR).
  const currency = mountCurrency(el, signal, siteId, options.locale);
  const unmountCurrency = currency.unmount;
  const t = uiText(options.locale);
  const key = cartKey(siteId);
  const added: Element[] = [];
  const undo: (() => void)[] = [];
  const read = (): CartLine[] => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.slice(0, 30) : [];
    } catch {
      return [];
    }
  };
  const write = (lines: CartLine[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(lines));
    } catch {}
    render();
    window.dispatchEvent(new CustomEvent(CART_CHANGE));
  };
  const on = <K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    capture = false,
  ) => target.addEventListener(type, fn as EventListener, { signal, capture });
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = "") => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  // ---- header cart link (none with the instant checkout popup: there is no cart)
  const links: HTMLAnchorElement[] = [];
  if (checkout && !popup) el.querySelectorAll<HTMLElement>("[data-site-header] .site-header__actions").forEach((actions) => {
    const link = make("a", "cart-link");
    link.href = checkout.href;
    link.setAttribute("aria-label", t.cart);
    // Without a cart look: the original cart icon, the link goes to the checkout page.
    const image = look?.button?.image ? safeUrl(look.button.image, true) : "";
    if (image) {
      const img = make("img", "cart-link__image");
      img.src = image;
      img.alt = "";
      img.width = 22;
      img.height = 22;
      link.append(img);
    } else link.insertAdjacentHTML("beforeend", cartIconSvg(look?.button?.icon));
    if (look?.button?.label) link.append(make("span", "cart-link__label text text--sm", look.button.label));
    link.append(make("span", "cart-link__count"));
    link.querySelector<HTMLElement>(".cart-link__count")!.hidden = true;
    if (look) {
      link.setAttribute("aria-haspopup", "dialog");
      on(link, "click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(CART_OPEN));
      });
    }
    actions.prepend(link);
    added.push(link);
    links.push(link);
  });

  // ---- add to cart
  const toast = make("div", "cart-toast");
  toast.setAttribute("role", "status");
  toast.hidden = true;
  document.body.append(toast);
  added.push(toast);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const announce = (name: string) => {
    toast.replaceChildren(make("span", "", `${t.added}: ${name}`));
    const open = make("a", "cart-toast__link", t.openCart);
    open.href = checkout?.href || "#";
    if (look)
      open.onclick = (e) => {
        e.preventDefault();
        toast.hidden = true;
        window.dispatchEvent(new CustomEvent(CART_OPEN));
      };
    toast.append(open);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 4000);
  };
  undo.push(() => clearTimeout(toastTimer));
  const lineFrom = (button: Element): CartLine | null => {
    const section = button.closest<HTMLElement>("[data-section-id]");
    if (!section) return null;
    const base = { pageId, sectionId: section.dataset.sectionId!, qty: 1 };
    const card = button.closest(".pricing__shop-card");
    if (card) {
      const price = textOf(card.querySelector(".pricing__shop-price .heading"));
      return { ...base, name: textOf(card.querySelector(".pricing__shop-title")), options: [], price: num(price), currency: currencyOf(price) };
    }
    const product = button.closest("[data-product]");
    if (product) {
      const price = textOf(product.querySelector("[data-product-price]"));
      const options = [...product.querySelectorAll("[data-choice-group]")].map((group) => {
        const choice = group.querySelector(".pricing__pd-choice.is-active") || group.querySelector(".pricing__pd-choice");
        return textOf([...(choice?.children || [])].find((c) => !c.classList.contains("pricing__pd-delta")));
      });
      // a choice from an option picker pop-up (pricing-v25) goes after the groups
      const picked = product.querySelector<HTMLElement>(".pricing__pd-pick[data-picked]")?.dataset.picked;
      if (picked) options.push(picked);
      const info = product.querySelector(".pricing__pd-info") || product;
      return { ...base, name: textOf(info.querySelector("h1,h2,h3")), options, price: num(price), currency: currencyOf(price) };
    }
    const cfg = button.closest("[data-configurator]");
    if (cfg) {
      const steps = [...cfg.querySelectorAll(".pricing__cfg-step")];
      const values = steps.map((step) =>
        textOf(step.querySelector(".pricing__cfg-option.is-active .pricing__cfg-option-name")) ||
        textOf(step.querySelector(".pricing__cfg-value")),
      );
      const price = textOf(cfg.querySelector("[data-cfg-total]"));
      return { ...base, name: values[0] || "", options: values, price: num(price), currency: currencyOf(price) };
    }
    return null;
  };
  const ORDER_BUTTONS = ".pricing__shop-foot .button, .pricing__pd-buy .button, .pricing__cfg-buy .button";
  // Instant checkout popup: order buttons no longer link to the checkout page.
  if (popup) undo.push(closeCheckoutPopup);
  if (popup)
    el.querySelectorAll<HTMLAnchorElement>(ORDER_BUTTONS).forEach((a) => {
      const href = a.getAttribute("href");
      if (href === null) return;
      a.setAttribute("href", "#order");
      undo.push(() => a.setAttribute("href", href));
    });
  on(
    el,
    "click",
    (e) => {
      const button = (e.target as Element).closest(ORDER_BUTTONS);
      if (!button || !el.contains(button)) return;
      const line = lineFrom(button);
      if (!line || !line.name) return;
      e.preventDefault();
      if (popup) {
        openCheckoutPopup(popupItem(button, line), {
          root: el,
          siteId,
          pageId,
          locale: options.locale,
          fx: currency.approx,
        });
        window.dispatchEvent(new CustomEvent("cms:track", { detail: { e: "cart" } }));
        return;
      }
      const lines = read();
      const same = lines.find(
        (l) => l.pageId === line.pageId && l.sectionId === line.sectionId && l.name === line.name && l.options.join("|") === line.options.join("|"),
      );
      if (same) same.qty = Math.min(20, same.qty + 1);
      else lines.push(line);
      write(lines.slice(0, 30));
      announce(line.name);
      // An order button that links to the checkout page goes there right away (like a "buy now"), the
      // product is in the cart; other buttons stay on the page with the notice.
      const href = button.getAttribute("href");
      if (checkout && href && new URL(href, location.href).pathname === new URL(checkout.href, location.href).pathname)
        location.assign(checkout.href);
      // Analytics funnel step (site-analytics.tsx listens; no data about the product is sent).
      window.dispatchEvent(new CustomEvent("cms:track", { detail: { e: "cart" } }));
    },
    true,
  );

  // ---- checkout (pricing-v24) on the checkout page
  const box = el.querySelector<HTMLElement>(".pricing--checkout");
  let list: HTMLElement | null = null,
    totalRow: HTMLElement | null = null,
    status: HTMLElement | null = null,
    address: HTMLTextAreaElement | null = null,
    zoneSelect: HTMLSelectElement | null = null,
    deliveryOn = false;
  // Delivery zones of the site's delivery block (contact-v20), priced like its calculator.
  let zones: { name: string; price: number | null; from: number | null; priceText: string }[] = [];
  const zoneCost = (subtotal: number) => {
    const zone = zones.find((z) => z.name === zoneSelect?.value);
    if (!deliveryOn || !zone) return 0;
    return zone.price === null || (zone.from !== null && subtotal >= zone.from) ? 0 : zone.price;
  };
  const submit = box?.querySelector<HTMLButtonElement>(".pricing__co-submit") || null;
  if (box && pageId === checkout?.id) {
    const aside = box.querySelector<HTMLElement>(".pricing__co-summary");
    if (aside) {
      aside.classList.add("is-cart");
      list = make("div", "cart-lines");
      totalRow = make("p", "cart-total");
      aside.prepend(list, totalRow);
      added.push(list, totalRow);
      undo.push(() => aside.classList.remove("is-cart"));
    }
    const form = box.querySelector<HTMLElement>(".pricing__co-form");
    if (form) {
      form.classList.add("is-live");
      undo.push(() => form.classList.remove("is-live"));
      const switches = form.querySelectorAll<HTMLElement>("[data-segmented]");
      const pickup = form.querySelector<HTMLElement>(".pricing__co-pickup");
      address = make("textarea", "pricing__co-input cart-address text text--md");
      address.placeholder = t.address;
      address.setAttribute("aria-label", t.address);
      address.maxLength = 500;
      address.rows = 2;
      address.hidden = true;
      (pickup || switches[1] || form).after(address);
      added.push(address);
      zoneSelect = make("select", "pricing__co-input cart-zone text text--md");
      zoneSelect.setAttribute("aria-label", t.deliveryZone);
      zoneSelect.hidden = true;
      address.before(zoneSelect);
      added.push(zoneSelect);
      on(zoneSelect, "change", () => render());
      const syncDelivery = () => {
        const delivery = !!switches[1]?.querySelectorAll("button")[1]?.classList.contains("is-active");
        deliveryOn = delivery;
        address!.hidden = !delivery;
        address!.required = delivery;
        zoneSelect!.hidden = !delivery || !zones.length;
        zoneSelect!.required = delivery && zones.length > 0;
        if (pickup) pickup.hidden = delivery;
        render();
      };
      fetch(`/api/shop/orders?site=${encodeURIComponent(siteId)}&locale=${encodeURIComponent(options.locale || "")}`, { signal })
        .then((r) => r.json())
        .then((data) => {
          zones = Array.isArray(data.zones) ? data.zones : [];
          const placeholder = make("option", "", t.deliveryZone);
          placeholder.value = "";
          zoneSelect!.replaceChildren(
            placeholder,
            ...zones.map((z) => {
              const option = make("option", "", z.priceText ? `${z.name} · ${z.priceText}` : z.name);
              option.value = z.name;
              return option;
            }),
          );
          syncDelivery();
        })
        .catch(() => {});
      if (switches[1]) on(switches[1], "click", () => setTimeout(syncDelivery));
      undo.push(() => pickup && (pickup.hidden = false));
      syncDelivery();
      status = make("p", "cart-status text text--sm");
      status.setAttribute("role", "status");
      submit?.after(status);
      added.push(status);
    }
    if (submit)
      on(submit, "click", async (e) => {
        e.preventDefault();
        const lines = read();
        const form = box.querySelector<HTMLElement>(".pricing__co-form")!;
        const inputs = [...form.querySelectorAll<HTMLInputElement>("input.pricing__co-input")];
        const name = inputs.find((i) => i.type === "text"),
          phone = inputs.find((i) => i.type === "tel"),
          email = inputs.find((i) => i.type === "email");
        [name, phone].forEach((i) => i && (i.required = true));
        const fields = [name, phone, email, zoneSelect, address].filter(Boolean) as (
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLSelectElement
        )[];
        if (!lines.length) {
          status!.textContent = t.empty;
          return;
        }
        if (fields.some((f) => !f.hidden && !f.reportValidity())) return;
        const switches = form.querySelectorAll<HTMLElement>("[data-segmented]");
        const second = (g?: Element) => !!g?.querySelectorAll("button")[1]?.classList.contains("is-active");
        submit.disabled = true;
        status!.textContent = t.sending;
        try {
          const tokenResponse = await fetch(
            `/api/forms/token?pageId=${encodeURIComponent(pageId)}&site=${encodeURIComponent(siteId)}`,
            { signal },
          );
          const token = await tokenResponse.json();
          if (!tokenResponse.ok) throw new Error(token.error);
          // Signed tokens are valid from one second after issue.
          await new Promise((r) => setTimeout(r, 1100));
          const response = await fetch("/api/shop/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({
              site: siteId,
              pageId,
              token: token.token,
              locale: options.locale,
              items: lines.map(({ pageId, sectionId, name, options, qty }) => ({ pageId, sectionId, name, options, qty })),
              customer: {
                type: second(switches[0]) ? "company" : "private",
                name: name?.value || "",
                phone: phone?.value || "",
                email: email?.value || "",
              },
              delivery: {
                method: second(switches[1]) ? "delivery" : "pickup",
                address: address?.value || "",
                zone: zoneSelect?.value || "",
              },
              consents: [...form.querySelectorAll<HTMLInputElement>(".pricing__co-check input:checked")].map((c) =>
                textOf(c.closest("label")),
              ),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          write([]);
          window.dispatchEvent(new CustomEvent("cms:track", { detail: { e: "order" } }));
          status!.textContent = result.message;
          fields.forEach((f) => (f.value = ""));
        } catch (error) {
          if (!signal.aborted) status!.textContent = error instanceof Error ? error.message : t.failed;
        } finally {
          submit.disabled = false;
        }
      });
  }

  function render() {
    const lines = read();
    const count = lines.reduce((s, l) => s + l.qty, 0);
    links.forEach((link) => {
      const badge = link.querySelector<HTMLElement>(".cart-link__count")!;
      badge.hidden = !count;
      badge.textContent = String(count);
    });
    if (!list || !totalRow) return;
    list.replaceChildren();
    if (!lines.length) list.append(make("p", "cart-empty text text--md", t.empty));
    lines.forEach((line, i) => {
      const row = make("div", "cart-line");
      const copy = make("div", "cart-line__copy");
      copy.append(make("p", "cart-line__name text text--md", line.name));
      // Configurator lines repeat their first step (the model) as the name.
      const shown = line.options.filter((o, n) => o && !(n === 0 && o === line.name));
      if (shown.length) copy.append(make("p", "cart-line__options text text--sm", shown.join(" · ")));
      const qty = make("div", "cart-line__qty");
      const minus = make("button", "cart-line__step", "−"),
        plus = make("button", "cart-line__step", "+"),
        remove = make("button", "cart-line__remove text text--sm", t.remove);
      [minus, plus, remove].forEach((b) => (b.type = "button"));
      minus.setAttribute("aria-label", `${t.quantity} −1`);
      plus.setAttribute("aria-label", `${t.quantity} +1`);
      minus.onclick = () => {
        const all = read();
        if (all[i]) all[i].qty = Math.max(1, all[i].qty - 1);
        write(all);
      };
      plus.onclick = () => {
        const all = read();
        if (all[i]) all[i].qty = Math.min(20, all[i].qty + 1);
        write(all);
      };
      remove.onclick = () => write(read().filter((_, n) => n !== i));
      qty.append(minus, make("span", "text text--md", String(line.qty)), plus);
      const price = make("p", "cart-line__price text text--md", Number.isNaN(line.price) ? "" : money(line.price * line.qty, line.currency));
      row.append(copy, qty, price, remove);
      list!.append(row);
    });
    const sum = lines.reduce((s, l) => s + (Number.isNaN(l.price) ? 0 : l.price * l.qty), 0);
    const currency = lines[0]?.currency || "€";
    const shipping = zoneCost(sum);
    const rows: HTMLElement[] = [];
    if (deliveryOn && zoneSelect?.value) {
      const row = make("span", "cart-total__delivery text text--md");
      row.append(make("span", "", `${t.delivery} · ${zoneSelect.value}`), make("span", "", shipping ? money(shipping, currency) : t.free));
      rows.push(row);
    }
    totalRow.replaceChildren(
      ...rows,
      make("span", "text text--lg", t.total),
      make("span", "heading heading--sm", lines.length ? money(sum + shipping, currency) : "—"),
    );
    if (submit) submit.disabled = !lines.length;
  }
  render();
  // The cart window (store-cart.tsx) changed the cart.
  window.addEventListener(CART_CHANGE, () => render(), { signal });
  // Another tab changed the cart.
  on(window, "storage" as keyof HTMLElementEventMap, (e) => {
    if ((e as unknown as StorageEvent).key === key) render();
  });
  return () => {
    unmountCurrency();
    added.forEach((node) => node.remove());
    undo.forEach((fn) => fn());
    if (submit) submit.disabled = false;
  };
}

// ---- Display currency (Zcena prototype: USD/GBP/SEK/NOK/PLN/CHF at ECB rates).
// Only for showing: prices in the DOM stay in EUR (every widget, the cart and the server read them), a converted
// "≈ …" text is drawn over them with CSS (::after + data-fx). The checkout stays in EUR and only adds the converted
// total next to it, with the prototype's note "approximate, ECB rate, you pay in euro". Without fresh rates → EUR.
const FX_LIST: [string, string][] = [["EUR", "€"], ["USD", "$"], ["GBP", "£"], ["SEK", "kr"], ["NOK", "kr"], ["PLN", "zł"], ["CHF", "CHF"]];
const FX_NOTE: Record<string, string> = {
  lv: "Aptuveni, pēc ECB kursa. Apmaksa — eiro.",
  ru: "Ориентировочно, по курсу ЕЦБ. Оплата — в евро.",
  en: "Approximate, ECB rate. You pay in euro.",
};
// ECB reference rates via Frankfurter (api.frankfurter.app now answers with a redirect without CORS headers).
const FX_URL = "https://api.frankfurter.dev/v1/latest?from=EUR&to=USD,GBP,SEK,NOK,PLN,CHF";
const FX_CACHE = "harbstone-fx-rates";
const FX_FRESH = 12 * 3600e3; // refetch after 12 h
const FX_STALE = 4 * 24 * 3600e3; // offline: cached ECB rates up to 4 days (weekends have no new rates), then EUR
const FX_AMOUNT = /(\d[\d\s  ]*(?:[.,]\d{1,2})?)\s*€/g;
const FX_SKIP = "script,style,textarea,select,option,[data-site-header],[data-no-fx],.contact__chat-q,[class*='account'],.pricing--checkout";
const FX_CSS = `
.fx-shown{font-size:0!important;letter-spacing:0!important}
.fx-shown::after{content:attr(data-fx);font-size:var(--fx-fs);line-height:var(--fx-lh);letter-spacing:var(--fx-ls)}
.fx-also::after{content:attr(data-fx);margin-left:.45em;font-size:14px;font-weight:500;letter-spacing:normal;opacity:.6}
.fx-dd{position:relative;flex-shrink:0}
.fx-dd__btn{font:inherit;font-size:13.5px;cursor:pointer;white-space:nowrap}
.fx-dd__menu{position:absolute;top:calc(100% + 6px);right:0;z-index:50;min-width:180px;padding:6px;border-radius:14px;background:#fff;box-shadow:0 16px 40px rgb(14 17 22/.14)}
.fx-dd__menu[hidden]{display:none}
.fx-dd__menu button{display:flex;width:100%;align-items:center;gap:10px;padding:9px 10px;border:0;border-radius:9px;background:transparent;color:#3a4150;font:inherit;font-size:14.5px;text-align:left;cursor:pointer}
.fx-dd__menu button:hover{background:#f3f4f6;color:#0e1116}
.fx-dd__menu button.is-on{background:rgb(10 108 240/.12);color:#0e1116}
.fx-dd__menu button:disabled{opacity:.45;cursor:default}
.fx-dd__menu button span{color:#6b7382}
.fx-dd__menu small{margin-left:auto;color:#6b7382;font-size:12px}
.fx-dd__note{padding:6px 10px 4px;color:#6b7382;font-size:11.5px;line-height:1.4}`;

function mountCurrency(el: HTMLElement, signal: AbortSignal, siteId: string, locale?: string) {
  const pill = [...el.querySelectorAll<HTMLElement>("[data-site-header] .site-header__pill")].find((p) =>
    /^EUR\s*€$/.test((p.textContent || "").trim()),
  );
  if (!pill) return { unmount: () => {}, approx: () => "" };
  const lang = (locale || "lv").slice(0, 2);
  const intl = ({ ru: "ru-RU", lv: "lv-LV", en: "en-GB" } as Record<string, string>)[lang] || "en-GB";
  const fmt = (n: number, d = 0) =>
    n.toLocaleString(intl, { maximumFractionDigits: d, minimumFractionDigits: d }).replace(/[\s  ]/g, " ");
  const curKey = `harbstone-fx:${siteId}`;
  const store = {
    get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  };
  let rates: Record<string, number> | null = null;
  try {
    const c = JSON.parse(store.get(FX_CACHE) || "null");
    if (c?.rates && Date.now() - c.t < FX_STALE) rates = c.rates;
  } catch {}
  let cur = store.get(curKey) || "EUR";
  const active = () => (cur !== "EUR" && rates?.[cur] ? cur : "EUR");
  const money = (eur: number) => {
    const c = active(), v = eur * (rates?.[c] || 1), sym = FX_LIST.find((x) => x[0] === c)![1];
    const n = fmt(Math.round(v / 10) * 10);
    return "≈ " + (c === "USD" || c === "GBP" ? sym + n : n + " " + sym);
  };
  const parse = (s: string) => Number(s.replace(/[\s  ]/g, "").replace(/,(?=\d{3}$)/, "").replace(",", "."));

  const style = document.createElement("style");
  style.textContent = FX_CSS;
  document.head.append(style);

  // Header: the static pill becomes a button + menu (prototype look); the original pill is hidden, restored on unmount.
  const dd = document.createElement("div");
  dd.className = "fx-dd";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${pill.className} fx-dd__btn`;
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "fx-dd__menu";
  menu.hidden = true;
  dd.append(btn, menu);
  pill.before(dd);
  pill.hidden = true;
  const renderMenu = () => {
    const c = active();
    btn.textContent = `${c} ${FX_LIST.find((x) => x[0] === c)![1]}`;
    menu.innerHTML =
      FX_LIST.map(([code, sym]) => {
        const off = code !== "EUR" && !rates?.[code];
        return `<button type="button" data-c="${code}" class="${code === c ? "is-on" : ""}"${off ? " disabled" : ""}>${code} <span>${sym}</span><small>${code === "EUR" ? "" : rates?.[code] ? fmt(rates[code], 2) : "—"}</small></button>`;
      }).join("") + `<div class="fx-dd__note">${FX_NOTE[lang] || FX_NOTE.en}</div>`;
  };
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
  }, { signal });
  menu.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-c]");
    if (!b || b.disabled) return;
    cur = b.dataset.c!;
    store.set(curKey, cur);
    close();
    renderMenu();
    apply(true);
  }, { signal });
  document.addEventListener("click", (e) => { if (!dd.contains(e.target as Node)) close(); }, { signal });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, { signal });

  // Prices: elements whose only content is text with "… €".
  const marked = new Set<HTMLElement>();
  const measured = new WeakSet<HTMLElement>();
  const unmark = (e: HTMLElement) => {
    e.classList.remove("fx-shown", "fx-also");
    e.removeAttribute("data-fx");
    ["--fx-fs", "--fx-lh", "--fx-ls"].forEach((p) => e.style.removeProperty(p));
    measured.delete(e);
    marked.delete(e);
  };
  function apply(remeasure = false) {
    const on = active() !== "EUR";
    const seen = new Set<HTMLElement>();
    if (on) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const e = n.parentElement;
        if (!e || seen.has(e) || !(n.nodeValue || "").includes("€")) continue;
        if (![...e.childNodes].every((c) => c.nodeType === 3)) continue;
        const text = e.textContent || "";
        FX_AMOUNT.lastIndex = 0;
        if (!FX_AMOUNT.test(text)) continue;
        // Checkout: stays in EUR; only its total gets the converted amount beside it (as the prototype).
        if (e.closest(".pricing--checkout")) {
          if (!e.closest(".cart-total") || !e.classList.contains("heading")) continue;
          seen.add(e);
          marked.add(e);
          e.classList.add("fx-also");
          FX_AMOUNT.lastIndex = 0;
          e.setAttribute("data-fx", text.replace(FX_AMOUNT, (_, d) => money(parse(d))).replace(/^.*?(≈)/, "$1"));
          continue;
        }
        if (e.closest(FX_SKIP)) continue;
        seen.add(e);
        if (remeasure || !measured.has(e)) {
          e.classList.remove("fx-shown");
          const cs = getComputedStyle(e);
          e.style.setProperty("--fx-fs", cs.fontSize);
          e.style.setProperty("--fx-lh", cs.lineHeight);
          e.style.setProperty("--fx-ls", cs.letterSpacing);
          measured.add(e);
        }
        FX_AMOUNT.lastIndex = 0;
        e.setAttribute("data-fx", text.replace(FX_AMOUNT, (_, d) => money(parse(d))));
        e.classList.add("fx-shown");
        marked.add(e);
      }
    }
    [...marked].forEach((e) => { if (!seen.has(e)) unmark(e); });
  }
  let frame = 0;
  const schedule = (remeasure = false) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => apply(remeasure));
  };
  // Widgets rewrite price texts (options, totals, filters, cart): follow them. Our own changes are attributes only.
  const observer = new MutationObserver(() => schedule());
  observer.observe(el, { subtree: true, childList: true, characterData: true });
  let resizeTimer = 0;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => schedule(true), 150); }, { signal });

  renderMenu();
  apply();
  const cached = (() => { try { return JSON.parse(store.get(FX_CACHE) || "null"); } catch { return null; } })();
  if (!cached || Date.now() - cached.t > FX_FRESH) {
    fetch(FX_URL, { signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.rates) return;
        rates = j.rates;
        store.set(FX_CACHE, JSON.stringify({ t: Date.now(), rates }));
        renderMenu();
        apply();
      })
      .catch(() => {});
  }
  return {
    // Converted amount for the checkout popup ("≈ $1,320"), "" while the display currency is EUR.
    approx: (eur: number) => (active() !== "EUR" ? money(eur) : ""),
    unmount: () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      [...marked].forEach(unmark);
      dd.remove();
      pill.hidden = false;
      style.remove();
    },
  };
}
