// Customer-facing runtime of the shop pop-ups and the account page (Zcena agent, 2026-11-19):
// - [data-account] (contact-v25): sign in / create account / find an order without an account;
// - the header link to #account turns into the buyer's initials with a small menu when signed in;
// - [data-cabinet] (contact-v26): orders, one order (history, documents), profile, warranty card, receipt;
// - [data-search] (contact-v27): live search over the website's products and pages (/api/shop/search);
// - [data-chat] (contact-v28): chat panel; a message opens the messenger link with the text filled in.
// Accounts: /api/shop/account (own cookie and store, never CMS access). All texts come from the
// templates' fields ([data-l] labels), so every site can translate them in the editor.
type Item = { name: string; options: string[]; qty: number; unitPrice: number; total: number; kind: string; image?: string };
type Order = {
  number: number; createdAt: string; status: string; history: { at: string; status: string }[]; currency: string;
  items: Item[]; subtotal: number; total: number; delivery: { method: string; address: string; zone?: string; price?: number };
  customer: { name: string; phone: string; email: string };
};
type Customer = { email: string; name: string; surname: string; phone: string; demo: boolean };
type Account = { customer: Customer | null; orders?: Order[] };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const labelsOf = (root: Element | null) => {
  const map: Record<string, string> = {};
  root?.querySelectorAll<HTMLElement>("[data-l]").forEach((e) => (map[e.dataset.l!] = (e.textContent || "").trim()));
  return map;
};
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const money = (n: number, currency = "EUR") =>
  `${Number.isInteger(n) ? n : n.toFixed(2)} ${currency === "EUR" ? "€" : currency}`;
let dateLocale = "lv";
const date = (iso: string, withTime = true) => {
  const d = new Date(iso);
  return d.toLocaleString(dateLocale, withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { weekday: "short", day: "numeric", month: "long", year: "numeric" });
};
const initials = (c: Customer) => ((c.name || c.email || "?")[0] + (c.surname ? c.surname[0] : "")).toUpperCase();
const ICON = {
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
};

export function mountAccountWidgets(
  el: HTMLElement,
  signal: AbortSignal,
  opts: { siteId?: string; locale?: string; editing?: boolean },
): () => void {
  const undo: (() => void)[] = [];
  const site = opts.siteId || "default";
  dateLocale = opts.locale || document.documentElement.lang || "lv";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const on = (t: EventTarget, type: string, fn: (e: any) => void, capture = false) =>
    t.addEventListener(type, fn as EventListener, { signal, capture });
  const accountRoot = el.querySelector<HTMLElement>("[data-account]");
  const cabinet = el.querySelector<HTMLElement>("[data-cabinet]");
  const L = { ...labelsOf(cabinet), ...labelsOf(accountRoot) };
  const cabinetUrl =
    accountRoot?.querySelector<HTMLAnchorElement>(".contact__acc-cabinet")?.getAttribute("href") || "";
  let state: Account = { customer: null };

  const api = async (body?: object): Promise<Account & { order?: Order; error?: string; status: number }> => {
    const res = await fetch(`/api/shop/account?site=${encodeURIComponent(site)}`, body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, ...body }), signal }
      : { signal, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return { ...data, status: res.status };
  };
  const statusName = (s: string) => L[`st-${s}`] || s;

  // ------------------------------------------------------------- header: initials + menu
  const headerLink = el.querySelector<HTMLAnchorElement>('[data-site-header] a[href="#account"]');
  let menu: HTMLElement | null = null;
  let avatar: HTMLElement | null = null;
  const renderHeader = () => {
    if (!headerLink) return;
    menu?.remove();
    avatar?.remove();
    menu = avatar = null;
    headerLink.classList.toggle("is-signed", !!state.customer);
    headerLink.querySelectorAll("svg").forEach((s) => ((s as unknown as HTMLElement).style.display = state.customer ? "none" : ""));
    const c = state.customer;
    if (!c) return;
    avatar = document.createElement("span");
    avatar.className = "account-avatar";
    avatar.textContent = initials(c);
    headerLink.append(avatar);
    headerLink.setAttribute("aria-label", [c.name, c.surname].filter(Boolean).join(" ") || c.email);
    menu = document.createElement("div");
    menu.className = "account-menu__panel";
    menu.innerHTML = `<div class="account-menu__head"><span class="account-avatar">${esc(initials(c))}</span><div><b>${esc([c.name, c.surname].filter(Boolean).join(" "))}</b><small>${esc(c.email)}</small></div></div>
      <a href="${esc(cabinetUrl)}">${esc(L.myorders || L.orders || "My orders")}</a><a href="${esc(cabinetUrl)}#settings">${esc(L.settings || "Settings")}</a><button type="button" data-acc-logout>${esc(L.logout || "Sign out")}</button>`;
    headerLink.parentElement?.classList.add("account-menu");
    headerLink.after(menu);
  };
  if (headerLink) {
    on(headerLink, "click", (e) => {
      if (!state.customer) return; // signed out: the pop-up opens (#account)
      e.preventDefault();
      e.stopPropagation();
      headerLink.parentElement?.classList.toggle("is-open");
    }, true);
    on(document, "click", (e) => {
      const t = e.target as Element;
      if (t.closest("[data-acc-logout]")) void logout();
      if (!t.closest(".account-menu")) headerLink.parentElement?.classList.remove("is-open");
    });
    undo.push(() => {
      menu?.remove();
      avatar?.remove();
      headerLink.parentElement?.classList.remove("account-menu", "is-open");
      headerLink.querySelectorAll("svg").forEach((s) => ((s as unknown as HTMLElement).style.display = ""));
    });
  }
  const logout = async () => {
    await api({ action: "logout" }).catch(() => {});
    state = { customer: null };
    renderHeader();
    renderCabinet();
  };

  // ------------------------------------------------------------- account pop-up
  if (accountRoot && !opts.editing) {
    const panes = [...accountRoot.querySelectorAll<HTMLElement>("[data-acc-pane]")];
    const show = (name: string) => panes.forEach((p) => (p.hidden = p.dataset.accPane !== name));
    on(accountRoot, "click", (e) => {
      const t = (e.target as Element).closest<HTMLElement>("[data-acc-show],[data-acc-submit]");
      if (!t) return;
      if (t.dataset.accShow) show(t.dataset.accShow);
      else void submit(t.dataset.accSubmit!, t.closest<HTMLElement>("[data-acc-pane]")!);
    });
    on(accountRoot, "keydown", (e) => {
      if (e.key !== "Enter" || !(e.target as Element).matches("input")) return;
      const pane = (e.target as Element).closest<HTMLElement>("[data-acc-pane]");
      pane?.querySelector<HTMLButtonElement>("[data-acc-submit]")?.click();
    });
    const submit = async (action: string, pane: HTMLElement) => {
      const val = (n: string) => pane.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value.trim() || "";
      const error = pane.querySelector<HTMLElement>("[data-acc-error]");
      const button = pane.querySelector<HTMLButtonElement>("[data-acc-submit]");
      const fail = (msg: string) => { if (error) { error.textContent = msg; error.hidden = false; } };
      if (error) error.hidden = true;
      const body =
        action === "login" ? { action, login: val("login"), password: pane.querySelector<HTMLInputElement>('[name="password"]')?.value || "" }
        : action === "register" ? { action, name: val("name"), email: val("email"), phone: val("phone"), password: pane.querySelector<HTMLInputElement>('[name="password"]')?.value || "" }
        : { action, number: val("number").replace(/\D/g, ""), contact: val("contact") };
      if (button) button.disabled = true;
      try {
        const res = await api(body);
        if (res.status === 429) return fail(L.many || "Too many attempts.");
        if (action === "lookup") {
          const box = pane.querySelector<HTMLElement>("[data-acc-result]");
          if (!res.order) return fail(L.notfound || res.error || "Not found.");
          if (box) { box.innerHTML = orderCard(res.order, false); box.hidden = false; }
          return;
        }
        if (!res.customer)
          return fail(res.status === 409 ? L.exists : res.status === 401 ? L.wrong : L.check || res.error || "Error");
        state = { customer: res.customer, orders: res.orders };
        renderHeader();
        renderCabinet();
        accountRoot.querySelector<HTMLElement>("[data-modal-close]")?.click();
        if (cabinetUrl && !cabinet) location.href = cabinetUrl;
      } catch {
        fail(L.check || "Error");
      } finally {
        if (button) button.disabled = false;
      }
    };
  }

  // ------------------------------------------------------------- account page
  const view = cabinet?.querySelector<HTMLElement>("[data-cab-view]");
  const signedOut = cabinet?.querySelector<HTMLElement>("[data-cab-out]");
  const shopUrl = cabinet?.querySelector<HTMLAnchorElement>(".contact__cab-shop")?.getAttribute("href") || "";
  const crumbs = (...parts: [string, string?][]) =>
    `<nav class="cab-crumbs">${parts.map(([t, h], i) => (i ? "<span>/</span>" : "") + (h ? `<a href="${esc(h)}">${esc(t)}</a>` : `<span>${esc(t)}</span>`)).join("")}</nav>`;
  const thumb = (o: Order) => {
    const img = o.items.find((i) => i.image)?.image;
    return `<span class="cab-th">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : "#"}</span>`;
  };
  const orderTitle = (o: Order) => o.items.map((i) => i.name + (i.qty > 1 ? ` × ${i.qty}` : "")).join(", ");
  function orderCard(o: Order, links = true) {
    return `<div class="cab-head"><div><b>${esc(L.order || "Order")} ${o.number}</b><br><small class="cab-muted">${esc(L.from || "")} ${esc(date(o.createdAt))}</small></div><span class="cab-pill s-${esc(o.status)}">${esc(statusName(o.status))}</span></div>
      <div class="cab-items">${o.items.map((i) => `<div class="cab-item"><div><b>${esc(i.name)}</b>${i.options.length ? `<small>${esc(i.options.join(" · "))}</small>` : ""}</div><b>${esc(money(i.total, o.currency))}</b></div>`).join("")}
      <div class="cab-item"><span class="cab-muted">${esc(L.delivery || "Delivery")}</span><span>${o.delivery.method === "pickup" ? esc(L.pickup || "Pickup") : o.delivery.price ? esc(money(o.delivery.price, o.currency)) : esc(L.free || "free")}</span></div></div>
      <div class="cab-sum"><span>${esc(L.total || "Total")}</span><b>${esc(money(o.total, o.currency))}</b></div>
      ${links ? `<div class="cab-note">${ICON.shield}<div><b>${esc(L.warranty || "")}</b><small>${esc(L.warrantyText || "")}</small></div></div>` : ""}`;
  }
  const steps = (o: Order) => {
    const order = ["new", "confirmed", "shipped", "done"];
    if (o.status === "cancelled") order.splice(1, 3, "cancelled");
    const at = (s: string) => o.history.find((h) => h.status === s)?.at;
    const reached = order.indexOf(o.status);
    return `<ol class="cab-steps">${order.map((s, i) => `<li class="cab-step${i <= reached ? " is-done" : ""}"><span class="cab-dot">${i <= reached ? ICON.check : ""}</span><div><b>${esc(statusName(s))}</b>${at(s) ? `<small>${esc(date(at(s)!))}</small>` : ""}</div></li>`).join("")}</ol>`;
  };
  const sellerLines = () => (L.sellerLines || "").split("\n").filter(Boolean);
  const docSheet = (o: Order, kind: "warranty" | "receipt") => {
    const c = state.customer!;
    const buyer = [o.customer.name || [c.name, c.surname].join(" "), o.customer.phone, o.customer.email].filter(Boolean);
    const done = o.history.find((h) => h.status === "done")?.at || o.createdAt;
    const head = `<div class="cab-sheet-head"><div class="cab-sheet-logo">${esc(sellerLines()[0] || "")}</div><div style="text-align:right"><h3>${esc(kind === "warranty" ? L.warrantyCard : L.receipt)}</h3><small class="cab-muted">${esc(L.order || "")} ${o.number} · ${esc(date(done, false))}</small></div></div>
      <div class="cab-two"><div><span class="cab-cap">${esc(L.seller)}</span>${sellerLines().map((l, i) => i ? `${esc(l)}<br>` : `<b>${esc(l)}</b><br>`).join("")}</div><div><span class="cab-cap">${esc(L.buyer)}</span>${buyer.map((l, i) => i ? `${esc(l)}<br>` : `<b>${esc(l)}</b><br>`).join("")}</div></div>`;
    const body = kind === "warranty"
      ? `<table class="cab-table"><tr><th>${esc(L.components)}</th><th>${esc(L.sn)}</th><th>${esc(L.warrantyCol)}</th></tr>${o.items.map((i) => `<tr><td>${esc([i.name, ...i.options].join(" · "))}</td><td>—</td><td>${esc(L.warrantyText || "")}</td></tr>`).join("")}</table>
        <h4>${esc(L.termsTitle)}</h4><div class="cab-terms">${(L.terms || "").split("\n").filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("")}</div>`
      : `<table class="cab-table"><tr><th>${esc(L.item)}</th><th>${esc(L.qty)}</th></tr>${o.items.map((i) => `<tr><td><b>${esc([i.name, ...i.options].join(" · "))}</b></td><td>${i.qty}</td></tr>`).join("")}</table>
        <div class="cab-two"><div><span class="cab-cap">${esc(L.receiveMethod)}</span><b>${esc(o.delivery.method === "pickup" ? L.pickup : L.delivery)}</b><br>${esc(o.delivery.address || "")}</div><div><span class="cab-cap">${esc(L.receiveDate)}</span><b>${esc(date(done))}</b></div></div>`;
    return `<div class="cab-doc-page"><div class="cab-doc-bar"><a href="#order-${o.number}">${esc(L.back || "←")} ${o.number}</a><button class="button text text--sm" type="button" data-cab-print>${esc(L.print)}</button></div>
      <div class="cab-sheet">${head}${body}<div class="cab-two"><div><span class="cab-cap">${esc(L.sum)}</span><b style="font-size:22px">${esc(money(o.total, o.currency))}</b></div><div><span class="cab-cap">${esc(L.sign)}</span><div class="cab-signline"></div>${esc(buyer[0] || "")} · ${esc(date(done))}</div></div></div></div>`;
  };
  function renderCabinet() {
    if (!cabinet || !view || !signedOut) return;
    const c = state.customer;
    signedOut.hidden = !!c;
    view.hidden = !c;
    if (!c) { view.innerHTML = ""; return; }
    const orders = state.orders || [];
    const hash = location.hash.slice(1);
    const num = Number((hash.match(/^(order|warranty|receipt)-(\d+)$/) || [])[2]);
    const o = orders.find((x) => x.number === num);
    if (hash === "settings") {
      view.innerHTML = `${crumbs([L.orders || "", "#"], [L.settings])}<div class="cab-panel"><div class="cab-form"><div class="cab-avatar"><span>${esc(initials(c))}</span><b>${esc([c.name, c.surname].filter(Boolean).join(" "))}</b></div>
        <div class="cab-fields"><label>${esc(L.fname)}<input name="name" value="${esc(c.name)}" autocomplete="given-name"></label><label>${esc(L.lname)}<input name="surname" value="${esc(c.surname)}" autocomplete="family-name"></label>
        <label>${esc(L.email)}<input value="${esc(c.email)}" readonly></label><label>${esc(L.phone)}<input name="phone" type="tel" value="${esc(c.phone)}" autocomplete="tel"></label>
        <h4>${esc(L.changePw)}</h4><label>${esc(L.pwCur)}<input name="current" type="password" autocomplete="current-password"></label><label>${esc(L.pwNew)}<input name="next" type="password" autocomplete="new-password" minlength="6"></label>
        <div class="cab-actions"><button class="button text text--md" type="button" data-cab-save>${esc(L.save)}</button><button class="button button--outline text text--md" type="button" data-acc-logout>${esc(L.logout)}</button><span class="cab-msg" data-cab-msg></span></div></div></div></div>`;
      return;
    }
    if (o && /^(warranty|receipt)-/.test(hash) && o.status === "done") {
      view.innerHTML = docSheet(o, hash.startsWith("warranty") ? "warranty" : "receipt");
      return;
    }
    if (o) {
      view.innerHTML = `${crumbs([L.orders || "", "#"], [String(o.number)])}<div class="cab-grid"><div>
        <div class="cab-panel">${orderCard(o)}</div>
        ${o.status === "done" ? `<div class="cab-panel"><h3>${esc(L.docs)}</h3><div class="cab-docs"><a class="cab-doc" href="#warranty-${o.number}">${ICON.shield}<span><b>${esc(L.warrantyCard)}</b><small>${esc(L.warrantyCardSub)}</small></span></a><a class="cab-doc" href="#receipt-${o.number}">${ICON.check}<span><b>${esc(L.receipt)}</b><small>${esc(date(o.history.find((h) => h.status === "done")?.at || o.createdAt))}</small></span></a></div></div>` : ""}
        <div class="cab-panel"><h3>${esc(o.delivery.method === "pickup" ? L.pickup : L.delivery)}</h3>${o.delivery.method === "pickup" ? `<p>${esc(L.pickupText)}</p>` : `<p class="cab-muted">${esc(o.delivery.address)}</p><p>${esc(o.status === "done" ? statusName("done") : L.deliveryLater)}</p>`}</div>
        <div class="cab-panel"><h3>${esc(L.messages)}</h3><p class="cab-muted">${esc(L.noMessages)}</p></div></div>
        <aside class="cab-panel"><h3>${esc(L.history)}</h3>${steps(o)}</aside></div>`;
      return;
    }
    view.innerHTML = `<div class="cab-panel"><h3>${esc(L.orders)}</h3>${orders.length
      ? orders.map((x) => `<a class="cab-row" href="#order-${x.number}">${thumb(x)}<div><b>${esc(L.order)} ${x.number} · ${esc(date(x.createdAt))}</b><small>${esc(orderTitle(x))}</small></div><b>${esc(money(x.total, x.currency))}</b><span class="cab-pill s-${esc(x.status)}">${esc(statusName(x.status))}</span></a>`).join("")
      : `<p class="cab-muted">${esc(L.none)}</p>${shopUrl ? `<p><a class="button text text--md" href="${esc(shopUrl)}">${esc(cabinet.querySelector(".contact__cab-shop")?.textContent || "")}</a></p>` : ""}`}</div>`;
  }
  if (cabinet && view) {
    on(window, "hashchange", () => { renderCabinet(); if (location.hash) scrollTo({ top: 0 }); });
    on(view, "click", async (e) => {
      const t = e.target as Element;
      if (t.closest("[data-cab-print]")) { print(); return; }
      if (!t.closest("[data-cab-save]")) return;
      const v = (n: string) => view.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value || "";
      const msg = view.querySelector<HTMLElement>("[data-cab-msg]");
      const res = await api({ action: "profile", name: v("name"), surname: v("surname"), phone: v("phone").trim() });
      if (res.customer) state = { customer: res.customer, orders: res.orders };
      let text = res.customer ? L.saved : res.error || "";
      if (res.customer && v("next")) {
        const pw = await api({ action: "password", current: v("current"), next: v("next") });
        text = pw.status === 200 ? L.saved : pw.status === 403 ? L.pwWrong : pw.error || "";
      }
      renderHeader();
      renderCabinet();
      const m2 = view.querySelector<HTMLElement>("[data-cab-msg]") || msg;
      if (m2) m2.textContent = text;
    });
    undo.push(() => { view.innerHTML = ""; view.hidden = true; if (signedOut) signedOut.hidden = false; });
  }
  const refresh = () =>
    api().then((res) => {
      if (signal.aborted) return;
      state = { customer: res.customer || null, orders: res.orders };
      renderHeader();
      renderCabinet();
    }).catch(() => {});
  if (headerLink || cabinet) {
    void refresh();
    // The instant checkout popup created an account or placed an order (checkout-popup.ts).
    on(window, "cms:account-change", () => void refresh());
  }

  // ------------------------------------------------------------- search pop-up
  el.querySelectorAll<HTMLElement>("[data-search]").forEach((root) => {
    const input = root.querySelector<HTMLInputElement>("[data-search-input]");
    const out = root.querySelector<HTMLElement>("[data-search-results]");
    const hint = root.querySelector<HTMLElement>("[data-search-hint]");
    if (!input || !out) return;
    const S = labelsOf(root);
    type Index = { products: { title: string; specs: string[]; price: string; old: string; image: string; url: string }[]; pages: { title: string; text: string; url: string }[] };
    let index: Promise<Index> | null = null;
    const load = (): Promise<Index> => (index ||= fetch(`/api/shop/search?site=${encodeURIComponent(site)}`, { signal }).then((r) => r.json() as Promise<Index>).catch((): Index => ({ products: [], pages: [] })));
    let limit = 8, timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const words = fold(input.value).split(/[\s,/]+/).filter((w) => w.length > 1);
      if (hint) hint.hidden = words.length > 0;
      if (!words.length) { out.innerHTML = ""; return; }
      const data = await load();
      const hit = (text: string) => { const t = fold(text); return words.every((w) => t.includes(w)); };
      const products = data.products.filter((p) => hit([p.title, ...p.specs, p.price].join(" ")));
      const pages = data.pages.filter((p) => hit(`${p.title} ${p.text}`));
      if (!products.length && !pages.length) { out.innerHTML = `<p class="search-none">${esc(S.none)}</p>`; return; }
      out.innerHTML =
        (products.length ? `<div class="search-group"><h3>${esc(S.products)} · ${products.length}</h3><div class="search-cards">${products.slice(0, limit).map((p) => `<a class="search-card" href="${esc(p.url)}"><span class="search-card__img">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ""}</span><span class="search-card__body"><b>${esc(p.title)}</b><small>${esc(p.specs.join(" · "))}</small><span class="search-card__price">${esc(p.price)}${p.old ? `<s>${esc(p.old)}</s>` : ""}</span></span></a>`).join("")}</div>${products.length > limit ? `<button class="search-more" type="button" data-search-more>${esc((S.more || "{n}").replace("{n}", String(products.length)))}</button>` : ""}</div>` : "") +
        (pages.length ? `<div class="search-group"><h3>${esc(S.pages)}</h3><div class="search-pages">${pages.slice(0, 8).map((p) => `<a class="search-page" href="${esc(p.url)}"><span><b>${esc(p.title)}</b>${p.text ? `<small>${esc(p.text.slice(0, 140))}</small>` : ""}</span><span>›</span></a>`).join("")}</div></div>` : "");
    };
    on(input, "input", () => { limit = 8; clearTimeout(timer); timer = setTimeout(run, 120); });
    on(input, "focus", () => void load());
    on(out, "click", (e) => { if ((e.target as Element).closest("[data-search-more]")) { limit = 500; void run(); } });
    // Focus the field when the pop-up opens.
    const watch = new MutationObserver(() => { if (root.classList.contains("is-open")) setTimeout(() => input.focus(), 30); });
    watch.observe(root, { attributes: true, attributeFilter: ["class"] });
    undo.push(() => { watch.disconnect(); clearTimeout(timer); out.innerHTML = ""; });
  });

  // ------------------------------------------------------------- chat panel
  el.querySelectorAll<HTMLElement>("[data-chat]").forEach((root) => {
    const log = root.querySelector<HTMLElement>("[data-chat-log]");
    const input = root.querySelector<HTMLInputElement>("[data-chat-input]");
    const target = root.querySelector<HTMLAnchorElement>("[data-chat-target]")?.getAttribute("href") || "";
    const added: HTMLElement[] = [];
    const send = (text: string) => {
      const msg = text.trim();
      if (!msg || !log) return;
      const p = document.createElement("p");
      p.className = "contact__chat-msg text text--sm is-me";
      p.textContent = msg;
      log.append(p);
      added.push(p);
      log.scrollTop = log.scrollHeight;
      if (input) input.value = "";
      if (!target) return;
      try {
        const url = new URL(target, location.href);
        url.searchParams.set("text", msg);
        window.open(url.toString(), "_blank", "noopener");
      } catch {}
    };
    on(root, "click", (e) => {
      const t = e.target as Element;
      const q = t.closest<HTMLElement>(".contact__chat-q");
      if (q) send(q.textContent || "");
      if (t.closest("[data-chat-send]") && input) send(input.value);
    });
    if (input) on(input, "keydown", (e) => { if (e.key === "Enter") send(input.value); });
    undo.push(() => added.forEach((p) => p.remove()));
  });

  return () => undo.forEach((f) => f());
}
