import { paymentChoice } from "./payment-choice";
import type { PaymentMethod } from "@/lib/builder/payments-shared";
import type { CommerceSettings } from "@/lib/builder/commerce-settings";
import { checkoutBody, checkoutComplete } from "./checkout-request";
// Instant checkout popup (no cart), rebuilt 1:1 from the Zcena prototype's checkout(p, c):
// every order button (product card, product page, configurator) opens this popup for that one
// product; it sends a real order to /api/shop/orders (the server prices it again from the
// published page, decides the delivery zone from the address and stores it in Shop orders),
// and shows the "thank you" with the order number in the same popup.
// Website setting: project.store.checkout = "popup" (Website settings → Shop cart).
// Left: picture, title, short configuration, price lines (product, pickup/delivery, ready at,
// total + display currency), hint. Right: private/company (registration number looked up in
// the Latvian register of enterprises via /api/shop/lv), name, phone, e-mail, pickup/delivery
// (pickup point of the delivery block; address with register suggestions, towns of the delivery
// block and geolocation; zone price), customer account, status messages, newsletter, submit.
import type { CartLine } from "./cart-widgets";
import {
  foldText,
  zoneForAddress,
  type Place,
  type Point,
} from "@/lib/builder/shop-zones";

type Lang = "lv" | "ru" | "en";
// Texts of the prototype (js/i18n.js + js/account.js), lv / ru / en. Marked "own": not in the
// prototype (it had no real register fallback, no sending state).
const T = {
  lv: {
    h: "Noformēt pasūtījumu",
    sub: "Veikals apstiprinās jūsu pasūtījuma detaļas.",
    person: "Privātpersona",
    company: "Uzņēmums",
    reg: "Reģistrācijas numurs",
    searching: "Meklējam reģistrā…",
    regBad: "Šāda numura reģistrā nav. Pārbaudiet ciparus.",
    regClosed: "Uzņēmums likvidēts vai izslēgts no reģistra.",
    regOff: "Reģistrs šobrīd nav pieejams — numuru pārbaudīsim paši.", // own
    name: "Vārds",
    contact: "Kontaktpersona",
    phone: "Tālrunis",
    email: "E-pasts",
    pickup: "Saņemšu pats",
    delivery: "Piegāde",
    addr: "Piegādes adrese",
    addrPh: "Iela, māja, pilsēta",
    geo: "Mana vieta",
    flat: "Dzīvoklis / kāpņutelpa",
    flatPh: "dz. 12, 2. kāpņutelpa",
    notePh: "Domofona kods u.c.",
    pc: "Prece",
    total: "Kopā",
    pkH: "Saņemšana uz vietas",
    dlH: "Piegāde",
    free: "Bez maksas",
    byAddr: "pēc adreses",
    readyAt: "Gatavs saņemšanai",
    news: "Vēlos dažreiz saņemt no {shop} padomus datora kopšanai un uzlabojumu piedāvājumus. Var atteikties jebkurā brīdī, pasūtījumu neietekmē.",
    send: "Nosūtīt pasūtījumu",
    sending: "Sūtām…", // own
    terms:
      "Nospiežot «Nosūtīt pasūtījumu», jūs piekrītat [noteikumiem]. Mēs piezvanīsim un apstiprināsim detaļas.",
    err: "Pārbaudiet iezīmētos laukus",
    errAddr: "Izvēlieties adresi no ieteikumiem",
    errReg: "Pārbaudiet reģistrācijas numuru",
    geoNo: "Ģeolokācija šajā pārlūkā nav pieejama",
    geoWait: "Nosakām atrašanās vietu…",
    geoOk: "Adrese noteikta — precizējiet ielu un māju",
    geoFail: "Neizdevās noteikt — ievadiet adresi",
    geoMe: "Mana atrašanās vieta",
    notify: "Sūtīt pasūtījuma statusu uz",
    notifyP:
      "Paziņosim, kad pasūtījums būs gatavs. Tikai par šo pasūtījumu, bez reklāmas.",
    acc: "Izveidot personīgo kabinetu",
    accP: "pasūtījumu vēsture, statuss un garantija vienuviet",
    accPass: "Izdomājiet paroli (no 6 simboliem)",
    accIn: "Pasūtījums saglabāsies jūsu kabinetā",
    accLogin: "Jau ir kabinets? Ieiet",
    doneH: "Pasūtījums saņemts!",
    doneP:
      "Paldies, {n}! Piezvanīsim darba laikā, apstiprināsim komplektāciju un {w}.",
    doneWp: "saņemšanas laiku",
    doneWd: "piegādes laiku",
    pay: "Apmaksa",
    payV: "Saņemot",
    doneTot: "Kopā",
    cab: "Atvērt pasūtījumu",
    ok: "Gatavs",
  },
  ru: {
    h: "Оформить заказ",
    sub: "Магазин подтвердит детали вашего заказа.",
    person: "Частное лицо",
    company: "Компания",
    reg: "Регистрационный номер",
    searching: "Ищем в реестре…",
    regBad: "Такого номера нет в реестре. Проверьте цифры.",
    regClosed: "Компания ликвидирована или исключена из реестра.",
    regOff: "Реестр сейчас недоступен — проверим номер сами.", // own
    name: "Имя",
    contact: "Контактное лицо",
    phone: "Телефон",
    email: "Email",
    pickup: "Заберу сам",
    delivery: "Доставка",
    addr: "Адрес доставки",
    addrPh: "Улица, дом, город",
    geo: "Моё место",
    flat: "Квартира / подъезд",
    flatPh: "кв. 12, подъезд 2",
    notePh: "Код домофона и т.п.",
    pc: "Товар",
    total: "Итого",
    pkH: "Самовывоз",
    dlH: "Доставка",
    free: "Бесплатно",
    byAddr: "по адресу",
    readyAt: "Готов к выдаче",
    news: "Хочу иногда получать от {shop} советы по уходу за компьютером и предложения по апгрейду. Можно отписаться в любой момент, на заказ не влияет.",
    send: "Отправить заказ",
    sending: "Отправляем…", // own
    terms:
      "Нажимая «Отправить заказ», вы соглашаетесь с [правилами]. Мы перезвоним и подтвердим детали.",
    err: "Проверьте выделенные поля",
    errAddr: "Выберите адрес из подсказок",
    errReg: "Проверьте регистрационный номер",
    geoNo: "Геолокация недоступна в этом браузере",
    geoWait: "Определяем местоположение…",
    geoOk: "Адрес определён — уточните улицу и дом",
    geoFail: "Не удалось определить — введите адрес вручную",
    geoMe: "Моё местоположение",
    notify: "Присылать статус заказа в",
    notifyP:
      "Сообщим, когда компьютер собран и когда курьер выехал. Только по этому заказу, без рекламы.",
    acc: "Создать личный кабинет",
    accP: "история заказов, статус и гарантия в одном месте",
    accPass: "Придумайте пароль (от 6 символов)",
    accIn: "Заказ сохранится в вашем кабинете",
    accLogin: "Уже есть кабинет? Войти",
    doneH: "Заказ получен!",
    doneP:
      "Спасибо, {n}! Перезвоним в рабочее время, подтвердим комплектацию и {w}.",
    doneWp: "время самовывоза",
    doneWd: "время доставки",
    pay: "Оплата",
    payV: "При получении",
    doneTot: "Итого",
    cab: "Открыть заказ",
    ok: "Готово",
  },
  en: {
    h: "Place your order",
    sub: "Your order details will be confirmed by the shop.",
    person: "Individual",
    company: "Company",
    reg: "Registration number",
    searching: "Searching the register…",
    regBad: "This number is not in the register. Please check.",
    regClosed: "This company is liquidated or removed from the register.",
    regOff:
      "The register is not available right now — we will check the number ourselves.", // own
    name: "Name",
    contact: "Contact person",
    phone: "Phone",
    email: "Email",
    pickup: "I will pick up",
    delivery: "Delivery",
    addr: "Delivery address",
    addrPh: "Street, house, town",
    geo: "My location",
    flat: "Flat / entrance",
    flatPh: "flat 12, entrance 2",
    notePh: "Door code etc.",
    pc: "Item",
    total: "Total",
    pkH: "Pick-up",
    dlH: "Delivery",
    free: "Free",
    byAddr: "by address",
    readyAt: "Ready",
    news: "Send me occasional news and offers from {shop}. Unsubscribe any time; does not affect the order.",
    send: "Send order",
    sending: "Sending…", // own
    terms:
      "By sending the order you accept the [terms]. We will call to confirm the details.",
    err: "Please check the highlighted fields",
    errAddr: "Pick an address from the suggestions",
    errReg: "Check the registration number",
    geoNo: "Geolocation is not available in this browser",
    geoWait: "Locating…",
    geoOk: "Address found — check street and house",
    geoFail: "Could not locate — please type the address",
    geoMe: "My location",
    notify: "Send order status to",
    notifyP: "Updates about this order only, no ads.",
    acc: "Create an account",
    accP: "order history, status and warranty in one place",
    accPass: "Choose a password (6+ characters)",
    accIn: "The order will be saved to your account",
    accLogin: "Have an account? Sign in",
    doneH: "Order received!",
    doneP:
      "Thank you, {n}! We will call during working hours to confirm the configuration and {w}.",
    doneWp: "pick-up time",
    doneWd: "delivery time",
    pay: "Payment",
    payV: "On receipt",
    doneTot: "Total",
    cab: "Open the order",
    ok: "Done",
  },
} satisfies Record<Lang, Record<string, string>>;
type Text = (typeof T)["lv"];

const ICON = {
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
};
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const textOf = (el: Element | null | undefined) =>
  (el?.textContent || "").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- what is being ordered
export interface PopupItem {
  line: CartLine;
  image: string;
  title: string;
  short: string;
}
// Short names like the prototype (pcTitle / cfgShort): "Ryzen 5 5500 · RTX 5050 8 GB · 16 GB · 500 GB".
const shortName = (s: string) =>
  s
    .replace(/^(AMD|Intel) /, "")
    .replace(/^(GeForce|Radeon) /, "")
    .replace(/ DDR\d.*$/, "")
    .replace(/^(SSD|NVMe) /, "");
const imgSrc = (img: Element | null | undefined) =>
  img?.getAttribute("src") || "";
export function popupItem(button: Element, line: CartLine): PopupItem {
  const card = button.closest(".pricing__shop-card");
  if (card) {
    const specs = [...card.querySelectorAll(".pricing__shop-spec dd")]
      .map(textOf)
      .filter(Boolean)
      .slice(0, 4);
    return {
      line,
      image: imgSrc(card.querySelector("img")),
      title: line.name,
      short: specs.map(shortName).join(" · "),
    };
  }
  const product = button.closest("[data-product]");
  if (product) {
    // Specs with the chosen options in place of the included ones (the prototype's selected configuration).
    const specs = [
      ...product.querySelectorAll(".pricing__pd-specs .pricing__pd-spec"),
    ]
      .slice(0, 4)
      .map((s) => ({
        dt: textOf(s.querySelector("dt")),
        dd: textOf(s.querySelector("dd")),
      }));
    product.querySelectorAll("[data-choice-group]").forEach((group) => {
      const choices = [...group.querySelectorAll(".pricing__pd-choice")].map(
        (c) => textOf(c.querySelector(":scope > :not(.pricing__pd-delta)")),
      );
      const active =
        textOf(
          group.querySelector(
            ".pricing__pd-choice.is-active > :not(.pricing__pd-delta)",
          ),
        ) || choices[0];
      const label = textOf(group.querySelector(".pricing__pd-label"));
      const spec = specs.find(
        (s) => (label && s.dt === label) || choices.includes(s.dd),
      );
      if (spec && active) spec.dd = active;
    });
    const picked = product.querySelector<HTMLElement>(
      ".pricing__pd-pick[data-picked]",
    );
    const short = specs.length
      ? specs.map((s) => shortName(s.dd)).join(" · ")
      : textOf(product.querySelector(".pricing__pd-buy-line"));
    return {
      line,
      image:
        imgSrc(picked?.querySelector("img")) ||
        imgSrc(product.querySelector(".pricing__pd-image")),
      title:
        textOf(
          (product.querySelector(".pricing__pd-info") || product).querySelector(
            "h1,h2,h3",
          ),
        ) || line.name,
      short: (product as HTMLElement).dataset.variantLabel || short,
    };
  }
  const cfg = button.closest("[data-configurator]");
  // Configurator: the first step is the case (its picture); the title is processor · graphics card.
  const values = (cfg ? [...cfg.querySelectorAll(".pricing__cfg-step")] : [])
    .slice(1)
    .map((s) => textOf(s.querySelector(".pricing__cfg-value")));
  const parts = values.filter(Boolean).map(shortName);
  const gpu = parts.find((v) => /\b(RTX|GTX|RX|Arc)\s/.test(v));
  return {
    line,
    image: imgSrc(cfg?.querySelector(".pricing__cfg-image")),
    title:
      [parts[0], gpu?.replace(/ \d+ GB$/, "")].filter(Boolean).join(" · ") ||
      line.name,
    short: parts.join(" · "),
  };
}

// ---------------------------------------------------------------- website data (cached per page load)
interface Zone {
  name: string;
  price: number | null;
  from: number | null;
  priceText: string;
  term: string;
}
interface SiteData {
  receiptEmailRequired?: boolean;
  paymentMethods?: PaymentMethod[];
  settings?: CommerceSettings;
  zones: Zone[];
  places: Place[];
  pickup: {
    address: string;
    hours: string[];
    note: string;
    google: string;
    waze: string;
    point: Point | null;
  } | null;
  shop: string;
}
const loadSite = (siteId: string, locale: string): Promise<SiteData> =>
  fetch(
    `/api/shop/orders?site=${encodeURIComponent(siteId)}&locale=${encodeURIComponent(locale)}`,
    { cache: "no-store" },
  )
    .then(async (r) => {
      if (!r.ok)
        throw new Error(
          "Could not load checkout settings. Close this window and try again.",
        );
      return r.json();
    })
    .then((d) => ({
      zones: d.zones || [],
      places: d.places || [],
      pickup: d.pickup || null,
      shop: d.shop || "",
      settings: d.settings,
      paymentMethods: d.paymentMethods,
      receiptEmailRequired: d.receiptEmailRequired,
    }));
const zoneCost = (z: Zone | undefined, sum: number) =>
  !z || z.price === null || (z.from !== null && sum >= z.from) ? 0 : z.price;

// ---------------------------------------------------------------- styles (the prototype's light theme)
const CSS = `
.hco-ovl{position:fixed;inset:0;z-index:1000;background:rgba(14,17,22,.45);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:grid;place-items:center;padding:20px;opacity:0;transition:opacity .2s}
.hco-ovl.is-show{opacity:1}
.hco-ovl *,.hco-toast{box-sizing:border-box}
.hco-sheet{--hco-accent:var(--color-interactive,#0a6cf0);--hco-ink:var(--color-ink,#0e1116);--hco-muted:var(--color-muted,#6b7382);position:relative;width:100%;max-width:560px;max-height:calc(100dvh - 40px);overflow:auto;background:#fff;border:1px solid transparent;border-radius:24px;box-shadow:0 24px 60px rgba(14,17,22,.16);padding:26px;transform:translateY(12px) scale(.98);transition:transform .22s;overscroll-behavior:contain;font-family:var(--font-body,Inter,system-ui,sans-serif);font-size:16px;font-weight:400;line-height:1.5;color:var(--hco-ink);text-align:left;-webkit-font-smoothing:antialiased}
.hco-ovl.is-show .hco-sheet{transform:none}
.hco-sheet.is-co{max-width:860px;padding:0;overflow:hidden auto}
.hco-sheet h2{font-family:var(--font-heading,"Inter Tight",Inter,system-ui,sans-serif);font-size:25px;font-weight:800;line-height:1.1;letter-spacing:-.015em;margin:0 0 6px;padding:0 36px 0 0;color:var(--hco-ink);text-transform:none}
.hco-sheet p{margin:0}
.hco-sheet b{font-weight:700}
.hco-sheet img{max-width:100%;display:block}
.hco-sheet a{color:inherit;text-decoration:none}
.hco-sheet button{font:inherit;color:inherit;cursor:pointer;margin:0;text-transform:none;letter-spacing:normal}
.hco-x{position:absolute;top:16px;right:16px;width:36px;height:36px;border-radius:50%;border:0;background:#f3f4f6;color:var(--hco-ink);font-size:22px!important;line-height:1;display:grid;place-items:center;z-index:2;padding:0}
.hco-x:hover{background:#e3e6eb}
.hco-co{display:grid;grid-template-columns:300px 1fr;gap:0}
.hco-l{background:#f5f6f8;padding:26px 22px;display:flex;flex-direction:column;gap:6px}
.hco-img{aspect-ratio:4/3;border-radius:14px;background:radial-gradient(120% 90% at 50% 15%,#fff 0%,#f1f3f6 60%,#e6e9ee 100%);position:relative;margin-bottom:10px}
.hco-img img{position:absolute;inset:14px;width:calc(100% - 28px);height:calc(100% - 28px);object-fit:contain;mix-blend-mode:multiply}
.hco-t{font-size:17px;font-family:var(--font-heading,"Inter Tight",Inter,sans-serif)}
.hco-l small{font-size:13px;color:var(--hco-muted)}
.hco-lines{border-top:1px dashed #cfd5de;padding-top:14px;display:flex;flex-direction:column;gap:6px;font-size:15px;color:#3a4150}
.hco-lines>div{display:flex;justify-content:space-between;gap:10px}
.hco-lines .is-tot{font-size:19px;font-weight:800;margin-top:4px;color:var(--hco-ink)}
.hco-l .hco-lines{margin-top:12px;font-size:14px}
.hco-l .hco-lines .is-tot{font-size:18px}
.hco-conv{color:var(--hco-muted);font-weight:500;font-size:14px;white-space:nowrap}
.hco-hint{font-size:12px;color:var(--hco-muted);font-weight:400}
.hco-l .hco-hint{margin-top:auto!important;padding-top:12px}
.hco-r{padding:26px 26px 20px;display:flex;flex-direction:column;gap:10px;min-width:0}
.hco-r h2{font-size:24px;margin-bottom:4px;padding-right:40px}
.hco-sheet input:not([type=checkbox]):not([type=radio]){display:block;height:44px;border:1px solid #dfe3e9;background:#fff;border-radius:11px;padding:0 13px;font:inherit;font-size:15.5px;width:100%;color:var(--hco-ink);margin:0;box-shadow:none;outline:none;transition:border-color .15s,box-shadow .15s;-webkit-appearance:none;appearance:none}
.hco-sheet input::placeholder{color:#9aa1ad;opacity:1}
.hco-sheet input:focus{outline:none;border-color:var(--hco-accent);box-shadow:0 0 0 3px rgba(10,108,240,.12)}
.hco-sheet input.is-bad{border-color:#e5262d!important}
.hco-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hco-tabs{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;background:#f3f4f6;border:1px solid transparent;border-radius:14px;padding:3px;gap:4px}
.hco-tabs button{border:0;background:transparent;border-radius:10px;height:36px;padding:1px 6px;font-size:14.5px;font-weight:600;color:var(--hco-muted);transition:background .15s,color .15s}
.hco-tabs button.is-on{background:#fff;color:var(--hco-ink);box-shadow:0 1px 3px rgba(14,17,22,.12)}
.hco-found{display:flex;gap:10px;align-items:center;background:#ecf9f1;color:#135c33;border:1px solid #c9eed8;border-radius:12px;padding:10px 12px;font-size:14px;margin-top:8px}
.hco-found svg{width:20px;height:20px;flex:none}
.hco-found b{display:block}
.hco-found.is-err{background:#fdecec;color:#7d1d20;border-color:#f6caca}
.hco-pk{display:flex;align-items:center;gap:8px;border:1px solid #e3e6eb;border-radius:12px;padding:9px 10px 9px 13px;font-size:13.5px}
.hco-pk>div{flex:1 1 0%;min-width:0;display:flex;flex-direction:column}
.hco-pk b{font-size:14px}
.hco-pk div>span{color:var(--hco-muted);font-size:12.5px}
.hco-hrs{display:flex;flex-direction:column;gap:2px}
.hco-hrs>span{white-space:nowrap}
.hco-pk a{flex:none;height:30px;display:inline-flex;align-items:center;padding:0 9px;border-radius:8px;background:#f3f4f6;font-size:12.5px;font-weight:600}
.hco-geo-wrap{position:relative;display:block}
.hco-geo-wrap input{padding-right:124px!important}
.hco-geo{position:absolute;right:4px;bottom:4px;height:36px;border:0;background:rgba(10,108,240,.12);color:var(--hco-accent)!important;border-radius:9px;padding:0 10px;font-size:13.5px!important;font-weight:600;display:flex;align-items:center;gap:6px}
.hco-sugg{position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#fff;border:1px solid #cfd5de;border-radius:12px;box-shadow:0 16px 40px rgba(14,17,22,.14);z-index:5;overflow:hidden}
.hco-sugg button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:11px 14px;font-size:15px;font-weight:400;color:var(--hco-ink)}
.hco-sugg button:hover{background:#f7f8fa}
.hco-sugg small{color:var(--hco-muted);font-size:13px}
.hco-flat{margin-top:0}
.hco-notify{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-radius:12px;background:#f5f6f8}
.hco-consent{display:flex;flex-direction:row;align-items:flex-start;gap:10px;font-weight:400;font-size:12px;line-height:1.5;color:var(--hco-muted);margin-top:2px;cursor:pointer}
.hco-notify .hco-consent{margin:0}
.hco-consent input{width:17px;height:17px;flex:none;margin:1px 3px 3px 4px;accent-color:var(--hco-accent)}
.hco-ch{display:flex;gap:8px;padding-left:26px}
.hco-ch label{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:9px;background:#fff;font-size:13.5px;font-weight:600;cursor:pointer}
.hco-ch input{accent-color:var(--hco-accent);margin:0}
.hco-sheet .hco-acc input[name=pass]{height:42px;border:0;border-radius:10px;padding:0 12px;font-size:15px}
.hco-link{color:var(--hco-accent)!important;font-weight:500}
.hco-link:hover{text-decoration:underline!important}
.hco-acc-login{font-size:13px;align-self:flex-start}
.hco-acc-in{display:flex;gap:8px;align-items:center;font-size:13.5px;padding:10px 12px;border-radius:12px;background:#f5f6f8}
.hco-acc-in svg{width:18px;height:18px;flex:none;color:#12813f}
.hco-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;height:46px;padding:0 20px;border-radius:13px;border:1px solid transparent;font-weight:600;font-size:15.5px;white-space:nowrap;transition:background .15s,box-shadow .2s}
.hco-btn-p{background:var(--hco-accent);color:#fff!important;box-shadow:0 6px 18px rgba(10,108,240,.28)}
.hco-btn-p:hover{background:var(--color-button-hover,#075fd6);box-shadow:0 8px 22px rgba(10,108,240,.36)}
.hco-btn-p:disabled{opacity:.7;cursor:default}
.hco-btn-s{background:#fff;border-color:#cfd5de;color:var(--hco-ink)}
.hco-btn-s:hover{background:#f7f8fa}
.hco-go{height:50px;font-size:16.5px;margin-top:2px}
.hco-terms{text-align:center}
.hco-done{text-align:center;padding:10px 0}
.hco-ok{width:72px;height:72px;border-radius:50%;background:#e7f8ee;color:#18a058;display:grid;place-items:center;margin:0 auto 16px;animation:hco-pop .4s}
.hco-ok svg{width:34px;height:34px}
@keyframes hco-pop{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.08)}}
.hco-done h2{padding:0}
.hco-num{display:inline-block;margin:10px 0 18px;background:#fff;border:1px solid #e3e6eb;border-radius:10px;padding:6px 12px;font-weight:700;letter-spacing:.04em}
.hco-done .hco-msg{color:var(--hco-muted);margin-bottom:18px}
.hco-done .hco-lines{text-align:left;margin:0 0 18px}
.hco-done .hco-btn-s{margin-top:8px}
.hco-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);background:#0e1116;color:#fff;padding:12px 18px;border-radius:12px;font-family:var(--font-body,Inter,system-ui,sans-serif);font-size:15px;font-weight:500;line-height:1.5;z-index:1001;opacity:0;transition:all .25s;pointer-events:none;max-width:calc(100vw - 32px)}
.hco-toast.is-show{opacity:1;transform:translate(-50%,0)}
@media (max-width:760px){
.hco-co{grid-template-columns:1fr}
.hco-l{flex-flow:row wrap;align-items:center;gap:4px 12px;padding:18px 16px 14px;margin:52px 16px 0;border-radius:16px}
.hco-img{width:64px;height:64px;aspect-ratio:auto;margin:0;flex:none}
.hco-img img{inset:4px;width:calc(100% - 8px);height:calc(100% - 8px)}
.hco-l>b,.hco-l>small{flex:1 1 calc(100% - 80px)}
.hco-l .hco-lines{flex:1 1 100%;margin-top:6px}
.hco-l .hco-hint{display:none}
.hco-r{padding:18px 16px calc(20px + env(safe-area-inset-bottom))}
.hco-ovl .hco-sheet.is-co{max-height:100dvh;height:100dvh;border-radius:0}
}
@media (max-width:640px){
.hco-ovl{place-items:end stretch;padding:0}
.hco-sheet{border-radius:22px 22px 0 0;max-height:92dvh;padding:22px 16px calc(22px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .28s cubic-bezier(.2,.8,.2,1);max-width:none!important}
.hco-sheet:not(.is-co)::before{content:"";display:block;width:40px;height:4px;border-radius:4px;background:#cfd5de;margin:-8px auto 14px}
.hco-sheet.is-co{padding:0}
.hco-row2{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){.hco-ovl,.hco-sheet,.hco-toast{transition:none!important}.hco-ok{animation:none}}`;

// ---------------------------------------------------------------- the popup
export interface PopupContext {
  root: HTMLElement; // the website root (.site-canvas): fonts and colours of the site
  siteId: string;
  pageId: string;
  locale?: string;
  // Display currency (cart-widgets.ts): "≈ $1,320" next to the euro total, or "" in euro.
  fx: (eur: number) => string;
}
let current: { close: () => void } | null = null;
export const closeCheckoutPopup = () => current?.close();

export function openCheckoutPopup(item: PopupItem, ctx: PopupContext) {
  current?.close();
  const code = (ctx.locale || document.documentElement.lang || "lv").slice(
    0,
    2,
  );
  const lang: Lang = code in T ? (code as Lang) : "lv";
  const t: Text = {
    ...T[lang],
    news:
      lang === "ru"
        ? "Получать новости и предложения от {shop}. Можно отписаться в любой момент."
        : lang === "lv"
          ? "Saņemt ziņas un piedāvājumus no {shop}. Var atteikties jebkurā laikā."
          : "Send me news and offers from {shop}. Unsubscribe at any time.",
    notifyP:
      lang === "ru"
        ? "Только обновления этого заказа, без рекламы."
        : lang === "lv"
          ? "Tikai šī pasūtījuma statusa ziņas, bez reklāmas."
          : "Updates about this order only, no ads.",
    doneP:
      lang === "ru"
        ? "Спасибо, {n}! Мы свяжемся с вами, чтобы подтвердить заказ и {w}."
        : lang === "lv"
          ? "Paldies, {n}! Sazināsimies, lai apstiprinātu pasūtījumu un {w}."
          : "Thank you, {n}! We will contact you to confirm the order and {w}.",
  };
  const intl = ({ lv: "lv-LV", ru: "ru-RU", en: "en-GB" } as const)[lang];
  let displayCurrency = item.line.currency || "€";
  const eur = (n: number) =>
    `${n.toLocaleString(intl, { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} ${{ EUR: "€", USD: "$", GBP: "£", RUB: "₽" }[displayCurrency] || displayCurrency}`;
  const price = Number.isNaN(item.line.price) ? 0 : item.line.price;
  const draftKey = `hco:${ctx.siteId}`;
  type Draft = {
    who: "person" | "company";
    how: "pickup" | "delivery";
    name: string;
    phone: string;
    email: string;
    reg: string;
    addr: string;
    flat: string;
    news: boolean;
  };
  let draft: Draft = {
    who: "person",
    how: "pickup",
    name: "",
    phone: "",
    email: "",
    reg: "",
    addr: "",
    flat: "",
    news: false,
  };
  try {
    draft = {
      ...draft,
      ...JSON.parse(sessionStorage.getItem(draftKey) || "{}"),
    };
  } catch {}
  const st = {
    ...draft,
    zone: -1, // row of the delivery block, -1 = not chosen yet
    point: null as Point | null,
    company: null as null | {
      reg: string;
      name: string;
      address: string;
      checked: boolean;
    },
  };
  const controller = new AbortController();
  const signal = controller.signal;
  const on = (target: EventTarget, type: string, fn: (e: Event) => void) =>
    target.addEventListener(type, fn, { signal });

  const style = document.createElement("style");
  style.textContent = CSS;
  const ovl = document.createElement("div");
  ovl.className = "hco-ovl";
  ovl.setAttribute("data-no-fx", "");
  const sheet = document.createElement("div");
  sheet.className = "hco-sheet is-co";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "hco-title");
  const x = document.createElement("button");
  x.type = "button";
  x.className = "hco-x";
  x.setAttribute("aria-label", "×");
  x.textContent = "×";
  const body = document.createElement("div");
  sheet.append(x, body);
  ovl.append(sheet);
  const toastEl = document.createElement("div");
  toastEl.className = "hco-toast";
  toastEl.setAttribute("role", "status");
  ctx.root.append(style, ovl, toastEl);
  const lastFocus = document.activeElement as HTMLElement | null;
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => ovl.classList.add("is-show"));
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-show"), 2200);
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    ovl.classList.remove("is-show");
    document.body.style.overflow = overflow;
    setTimeout(() => {
      ovl.remove();
      style.remove();
      clearTimeout(toastTimer);
      setTimeout(() => toastEl.remove(), 2300);
    }, 220);
    lastFocus?.focus?.({ preventScroll: true });
    if (current?.close === close) current = null;
  };
  current = { close };
  on(x, "click", close);
  on(ovl, "mousedown", (e) => {
    if (e.target === ovl) close();
  });
  on(document, "keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") close();
  });

  // Signed page token for the order (valid one second after issue): fetched while the buyer types.
  const tokenAt = Date.now();
  const token = fetch(
    `/api/forms/token?pageId=${encodeURIComponent(ctx.pageId)}&site=${encodeURIComponent(ctx.siteId)}`,
    { signal },
  ).then((r) =>
    r
      .json()
      .then((j) =>
        r.ok ? String(j.token || "") : Promise.reject(new Error(j.error)),
      ),
  );
  token.catch(() => {});
  // Customer account of this website (account-widgets.ts): signed in → the order goes to the account.
  const hasAccounts = !!ctx.root.querySelector(
    "[data-account], [data-cabinet]",
  );
  const cabinetUrl =
    ctx.root
      .querySelector<HTMLAnchorElement>(".contact__acc-cabinet")
      ?.getAttribute("href") || "";
  let customer: {
    name: string;
    surname: string;
    email: string;
    phone: string;
  } | null = null;
  // Terms: the website's warranty / terms page linked anywhere on the page.
  const termsHref =
    [...ctx.root.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .map((a) => a.getAttribute("href") || "")
      .find((h) => /garant|warrant|terms|noteikum|pravil|uslovi/i.test(h)) ||
    "";
  const terms = esc(t.terms).replace(/\[(.+?)\]/, (_, w) =>
    termsHref ? `<a class="hco-link" href="${esc(termsHref)}">${w}</a>` : w,
  );

  body.innerHTML = `<form class="hco-co" novalidate>
    <aside class="hco-l">
      <div class="hco-img">${item.image ? `<img src="${esc(item.image)}" alt="">` : ""}</div>
      <b class="hco-t">${esc(item.title)}</b>${item.short ? `<small>${esc(item.short)}</small>` : ""}
      <div class="hco-lines" data-lines></div>
      <p class="hco-hint">${esc(t.sub)}</p>
    </aside>
    <div class="hco-r">
      <h2 id="hco-title">${esc(t.h)}</h2>
      <div class="hco-tabs" data-k="who"><button type="button" data-v="person">${esc(t.person)}</button><button type="button" data-v="company">${esc(t.company)}</button></div>
      <div data-company hidden><input name="reg" inputmode="numeric" maxlength="11" placeholder="${esc(t.reg)} · 40003000000" autocomplete="off" aria-label="${esc(t.reg)}"><div class="hco-found" data-found hidden></div></div>
      <input name="name" autocomplete="name" placeholder="${esc(t.name)}" aria-label="${esc(t.name)}">
      <div class="hco-row2"><input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="${esc(t.phone)}" aria-label="${esc(t.phone)}"><input name="email" type="email" autocomplete="email" placeholder="${esc(t.email)}" aria-label="${esc(t.email)}"></div>
      <div class="hco-tabs" data-k="how"><button type="button" data-v="pickup">${esc(t.pickup)}</button><button type="button" data-v="delivery">${esc(t.delivery)}</button></div>
      <div class="hco-pk" data-pickup hidden></div>
      <div data-delivery hidden>
        <label class="hco-geo-wrap"><input name="addr" autocomplete="off" placeholder="${esc(t.addrPh)}" aria-label="${esc(t.addr)}"><button type="button" class="hco-geo" data-geo>${ICON.pin} ${esc(t.geo)}</button><span class="hco-sugg" data-sugg hidden></span></label>
        <input name="flat" placeholder="${esc(t.flatPh)} · ${esc(t.notePh)}" aria-label="${esc(t.flat)}" style="margin-top:10px">
      </div>
      <div data-acc-box></div>
      <div class="hco-notify"><label class="hco-consent"><input type="checkbox" name="ntf"> <span><b>${esc(t.notify)} WhatsApp / Telegram</b><br>${esc(t.notifyP)}</span></label>
        <div class="hco-ch" hidden><label><input type="radio" name="ch" value="whatsapp" checked> WhatsApp</label><label><input type="radio" name="ch" value="telegram"> Telegram</label></div></div>
      <label class="hco-consent"><input type="checkbox" name="news"> <span data-news>${esc(t.news.replace("{shop}", ""))}</span></label>
      <button class="hco-btn hco-btn-p hco-go" type="submit">${esc(t.send)}</button>
      <p class="hco-hint hco-terms">${terms}</p>
    </div>
  </form>`;
  const f = body.querySelector<HTMLFormElement>("form")!;
  const field = (n: string) =>
    f.querySelector<HTMLInputElement>(`[name="${n}"]`)!;
  const q = <E extends Element = HTMLElement>(s: string) =>
    f.querySelector<E>(s)!;
  (["name", "phone", "email", "reg", "addr", "flat"] as const).forEach(
    (k) => (field(k).value = st[k] || ""),
  );
  field("news").checked = !!st.news;
  const save = () => {
    (["name", "phone", "email", "reg", "addr", "flat"] as const).forEach(
      (k) => (st[k] = field(k).value),
    );
    st.news = field("news").checked;
    const { who, how, name, phone, email, reg, addr, flat, news } = st;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ who, how, name, phone, email, reg, addr, flat, news }),
      );
    } catch {}
  };
  on(f, "input", save);
  on(
    field("ntf"),
    "change",
    () => (q(".hco-ch").hidden = !field("ntf").checked),
  );
  setTimeout(() => {
    if (!closed && matchMedia("(min-width: 641px)").matches)
      field("name").focus();
  }, 60);

  let payment: ReturnType<typeof paymentChoice> | undefined;
  let data: SiteData = { zones: [], places: [], pickup: null, shop: "" };
  const zoneName = (z: number) => data.zones[z]?.name || "";
  const dCost = () =>
    st.how !== "delivery" || st.zone < 0
      ? null
      : zoneCost(data.zones[st.zone], price);
  function render() {
    f.querySelectorAll<HTMLElement>(".hco-tabs").forEach((tb) =>
      tb
        .querySelectorAll<HTMLElement>("button")
        .forEach((b) =>
          b.classList.toggle(
            "is-on",
            st[tb.dataset.k as "who" | "how"] === b.dataset.v,
          ),
        ),
    );
    q("[data-company]").hidden = st.who !== "company";
    field("name").placeholder = st.who === "company" ? t.contact : t.name;
    q("[data-pickup]").hidden = st.how !== "pickup" || !data.pickup;
    q("[data-delivery]").hidden = st.how !== "delivery";
    const dc = dCost();
    const dTxt =
      st.how === "pickup"
        ? t.free
        : dc === null
          ? t.byAddr
          : dc
            ? eur(dc)
            : t.free;
    const conv =
      !data.settings || data.settings.currency === "EUR"
        ? ctx.fx(price + (dc || 0))
        : "";
    q("[data-lines]").innerHTML =
      `<div><span>${esc(t.pc)}</span><span>${eur(price)}</span></div><div><span>${esc(st.how === "pickup" ? t.pkH : t.dlH)}${st.zone >= 0 && st.how === "delivery" ? ` · ${esc(zoneName(st.zone))}` : ""}</span><span>${esc(dTxt)}</span></div>
      <div class="is-tot"><span>${esc(t.total)}</span><span>${eur(price + (dc || 0))}${conv ? ` <span class="hco-conv">${esc(conv)}</span>` : ""}</span></div>`;
  }
  f.querySelectorAll<HTMLElement>(".hco-tabs").forEach((tb) =>
    on(tb, "click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("button");
      if (!b) return;
      if (tb.dataset.k === "who") st.who = b.dataset.v as Draft["who"];
      else st.how = b.dataset.v as Draft["how"];
      save();
      render();
    }),
  );
  render();
  q<HTMLButtonElement>(".hco-go").disabled = true;
  loadSite(ctx.siteId, ctx.locale || "")
    .then((d) => {
      if (closed) return;
      data = d;
      if(d.paymentMethods&&!d.paymentMethods.length)throw new Error("No payment methods are currently available. Please contact the shop.");
      payment = paymentChoice(
        q<HTMLButtonElement>(".hco-go"),
        d.paymentMethods || ["on_receipt"],
        "hco-in",
      );
      const settings = d.settings;
      const requiredEmail = () =>
        (field("email").required =
          !!settings?.checkout.emailRequired ||
          (!!d.receiptEmailRequired && payment?.value() === "yookassa"));
      payment.select.addEventListener("change", requiredEmail, { signal });
      requiredEmail();
      if (settings) {
        if (settings.revision) displayCurrency = settings.currency;
        field("phone").required = settings.checkout.phoneRequired;
        field("email").required =
          settings.checkout.emailRequired ||
          (!!d.receiptEmailRequired && payment?.value() === "yookassa");
        f.querySelectorAll<HTMLElement>(
          '.hco-tabs[data-k="who"] button',
        ).forEach((b) => {
          if (b.dataset.v === "company")
            b.hidden = !settings.checkout.companies;
        });
        f.querySelectorAll<HTMLElement>(
          '.hco-tabs[data-k="how"] button',
        ).forEach(
          (b) =>
            (b.hidden =
              b.dataset.v === "pickup"
                ? !settings.delivery.pickup
                : !settings.delivery.shipping),
        );
        if (!settings.checkout.companies) st.who = "person";
        if (st.how === "pickup" && !settings.delivery.pickup)
          st.how = "delivery";
        if (st.how === "delivery" && !settings.delivery.shipping)
          st.how = "pickup";
        field("news").closest("label")!.hidden = !settings.checkout.newsletter;
        if (!settings.checkout.newsletter) {
          field("news").checked = false;
          st.news = false;
        }
        field("ntf").closest("label")!.hidden =
          !settings.checkout.statusMessages;
        if (!settings.checkout.statusMessages) {
          field("ntf").checked = false;
          q(".hco-ch").hidden = true;
        }
        if (settings.delivery.country === "other") {
          reg.maxLength = 100;
          reg.inputMode = "text";
        }
      }
      if (reg.value && st.who === "company") lookup();
      q<HTMLButtonElement>(".hco-go").disabled = false;
      q("[data-news]").textContent = t.news.replace("{shop}", d.shop || "");
      const p = d.pickup;
      if (p)
        q("[data-pickup]").innerHTML =
          `<div><b>${esc(p.address)}</b><span><span class="hco-hrs">${[
            ...p.hours,
            p.note,
          ]
            .filter(Boolean)
            .map((l) => `<span>${esc(l)}</span>`)
            .join(
              "",
            )}</span></span></div>${p.google ? `<a href="${esc(p.google)}" target="_blank" rel="noopener">Google Maps</a>` : ""}${p.waze ? `<a href="${esc(p.waze)}" target="_blank" rel="noopener">Waze</a>` : ""}`;
      if (d.settings?.delivery.mode === "flat")
        st.zone = d.zones.length ? 0 : -1;
      else if (!d.zones.length && st.how === "delivery") st.zone = -1;
      if (st.addr && st.how === "delivery") setZone(st.addr, null);
      render();
    })
    .catch((e) => {
      if (!closed) toast(e.message || t.err);
    });

  // ---- account block
  const accountBox = q("[data-acc-box]");
  const renderAccount = () => {
    if (!hasAccounts) return (accountBox.innerHTML = "");
    accountBox.innerHTML = customer
      ? `<p class="hco-acc-in">${ICON.check}<span>${esc(t.accIn)} · <b>${esc([customer.name, customer.surname].filter(Boolean).join(" ") || customer.email)}</b></span></p>`
      : `<div class="hco-notify hco-acc"><label class="hco-consent"><input type="checkbox" name="mkacc" checked> <span><b>${esc(t.acc)}</b> — ${esc(t.accP)}</span></label>
        <input name="pass" type="password" autocomplete="new-password" placeholder="${esc(t.accPass)}" aria-label="${esc(t.accPass)}">${ctx.root.querySelector("[data-account]") ? `<a class="hco-link hco-acc-login" href="#account">${esc(t.accLogin)}</a>` : ""}</div>`;
    const mk = f.querySelector<HTMLInputElement>('[name="mkacc"]');
    if (mk) on(mk, "change", () => (field("pass").hidden = !mk.checked));
    const login = f.querySelector(".hco-acc-login");
    if (login) on(login, "click", () => close()); // the website's account pop-up opens from "#account"
  };
  renderAccount();
  if (hasAccounts)
    fetch(`/api/shop/account?site=${encodeURIComponent(ctx.siteId)}`, {
      signal,
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (closed || !j.customer) return;
        customer = j.customer;
        if (!field("name").value)
          field("name").value = [customer!.name, customer!.surname]
            .filter(Boolean)
            .join(" ");
        if (!field("email").value) field("email").value = customer!.email;
        if (!field("phone").value) field("phone").value = customer!.phone;
        save();
        renderAccount();
      })
      .catch(() => {});

  // ---- company: registration number looked up in the register of enterprises
  const found = q("[data-found]");
  const reg = field("reg");
  const lookup = () => {
    if (data.settings?.delivery.country === "other") {
      st.company = reg.value.trim()
        ? { reg: reg.value.trim(), name: "", address: "", checked: false }
        : null;
      found.hidden = true;
      return;
    }
    reg.value = reg.value.replace(/\D/g, "");
    st.company = null;
    if (reg.value.length < 11) return void (found.hidden = true);
    found.hidden = false;
    found.className = "hco-found";
    found.innerHTML = `<span>${esc(t.searching)}</span>`;
    const v = reg.value;
    const bad = (msg: string) => {
      st.company = null;
      found.className = "hco-found is-err";
      found.innerHTML = `<span>${esc(msg)}</span>`;
    };
    fetch(`/api/shop/lv?company=${v}`, { signal })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((j) => {
        if (reg.value !== v) return;
        if (!j.found) return bad(t.regBad);
        if (!j.active) return bad(t.regClosed);
        st.company = {
          reg: v,
          name: j.name,
          address: j.address,
          checked: true,
        };
        found.className = "hco-found";
        found.innerHTML = `${ICON.check}<div><b>${esc(j.name)}</b>${esc(j.address || "")}</div>`;
      })
      .catch(() => {
        if (reg.value !== v || signal.aborted) return;
        // Register unavailable: the number is accepted as typed and checked by the shop.
        st.company = { reg: v, name: "", address: "", checked: false };
        found.className = "hco-found";
        found.innerHTML = `${ICON.check}<div><b>${esc(v)}</b>${esc(t.regOff)}</div>`;
      });
  };
  on(reg, "input", lookup);

  // ---- delivery address: register suggestions (with coordinates), towns of the delivery block, geolocation
  const addr = field("addr");
  const sugg = q("[data-sugg]");
  function setZone(text: string, point: Point | null) {
    if (data.settings?.delivery.mode === "flat")
      return void (st.zone = data.zones.length ? 0 : -1);
    if (!data.zones.length) return void (st.zone = -1);
    st.zone = zoneForAddress(
      text,
      data.places,
      data.zones.length,
      point,
      data.pickup?.point,
    ).zone;
  }
  const setAddr = (text: string, point: Point | null) => {
    addr.value = text;
    st.addr = text;
    st.point = point;
    setZone(text, point);
    if (!data.zones.length) st.zone = -1;
    sugg.hidden = true;
    save();
    render();
    addr.classList.remove("is-bad");
  };
  const zoneLabel = (text: string, point: Point | null) =>
    data.zones.length
      ? zoneName(
          zoneForAddress(
            text,
            data.places,
            data.zones.length,
            point,
            data.pickup?.point,
          ).zone,
        )
      : "";
  let addrTimer: ReturnType<typeof setTimeout> | undefined,
    addrSeq = 0;
  on(addr, "input", () => {
    if (data.settings?.delivery.country === "other") {
      setAddr(addr.value, null);
      return;
    }
    st.zone = -1;
    st.point = null;
    render();
    clearTimeout(addrTimer);
    const qq = addr.value.trim();
    if (qq.length >= 4) {
      const seq = ++addrSeq;
      addrTimer = setTimeout(() => {
        fetch(`/api/shop/lv?address=${encodeURIComponent(qq)}`, { signal })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((list: { label: string; lat: number; lon: number }[]) => {
            if (seq !== addrSeq || !Array.isArray(list) || !list.length) return;
            sugg.innerHTML = list
              .map(
                (x, i) =>
                  `<button type="button" data-a="${i}">${esc(x.label)} <small>· ${esc(zoneLabel(x.label, x))}</small></button>`,
              )
              .join("");
            sugg.hidden = false;
            sugg.querySelectorAll<HTMLElement>("button[data-a]").forEach((b) =>
              on(b, "click", () => {
                const x = list[Number(b.dataset.a)];
                setAddr(x.label, { lat: x.lat, lon: x.lon });
              }),
            );
          })
          .catch(() => {});
      }, 280);
    }
    if (qq.length < 3) return void (sugg.hidden = true);
    // Instant suggestions: towns of the delivery block named in the text (the prototype's city list).
    const ws = foldText(qq)
      .split(/[\s,]+/)
      .filter((w) => w.length > 2);
    let towns = data.places.filter((p) =>
      ws.some((w) => foldText(p.name).startsWith(w)),
    );
    const street = towns.length
      ? qq
          .replace(
            new RegExp(
              `[,\\s]*(${towns.map((c) => c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*$`,
              "i",
            ),
            "",
          )
          .trim() || qq
      : qq;
    if (!towns.length) towns = data.places.slice(0, 4);
    if (!towns.length) return void (sugg.hidden = true);
    sugg.innerHTML = towns
      .slice(0, 5)
      .map(
        (c) =>
          `<button type="button" data-c="${esc(c.name)}" data-s="${esc(street)}">${esc(street)}, <b>${esc(c.name)}</b> <small>· ${esc(zoneName(c.zone))}</small></button>`,
      )
      .join("");
    sugg.hidden = false;
  });
  on(sugg, "click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("button[data-c]");
    if (!b) return;
    setAddr(`${b.dataset.s}, ${b.dataset.c}`, null);
  });
  on(addr, "blur", () => setTimeout(() => (sugg.hidden = true), 180));
  on(q("[data-geo]"), "click", () => {
    if (!navigator.geolocation) return toast(t.geoNo);
    toast(t.geoWait);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (closed) return;
        const pt = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setAddr(`${t.geoMe}, ${pt.lat.toFixed(4)}, ${pt.lon.toFixed(4)}`, pt);
        toast(t.geoOk);
      },
      () => toast(t.geoFail),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
  if (st.addr && st.how === "delivery") setZone(st.addr, null);

  // ---- submit
  const go = q<HTMLButtonElement>(".hco-go");
  on(f, "submit", async (e) => {
    e.preventDefault();
    if (go.disabled) return;
    save();
    const bad: HTMLInputElement[] = [];
    const mk = f.querySelector<HTMLInputElement>('[name="mkacc"]');
    const pass = f.querySelector<HTMLInputElement>('[name="pass"]');
    if (mk?.checked && pass && pass.value.length < 6) bad.push(pass);
    if (!field("name").value.trim()) bad.push(field("name"));
    if (
      (data.settings?.checkout.phoneRequired !== false ||
        field("phone").value.trim()) &&
      field("phone").value.replace(/\D/g, "").length < 6
    )
      bad.push(field("phone"));
    if (
      (field("email").required ||
        data.settings?.checkout.emailRequired ||
        mk?.checked ||
        field("email").value.trim()) &&
      !/^\S+@\S+\.\S+$/.test(field("email").value.trim())
    )
      bad.push(field("email"));
    if (st.who === "company" && !st.company) bad.push(reg);
    if (
      st.how === "delivery" &&
      (data.zones.length ? st.zone < 0 : !addr.value.trim())
    )
      bad.push(addr);
    f.querySelectorAll("input").forEach((i) => i.classList.remove("is-bad"));
    bad.forEach((i) => i.classList.add("is-bad"));
    if (bad.length) {
      bad[0].focus();
      return toast(
        bad[0] === addr ? t.errAddr : bad[0] === reg ? t.errReg : t.err,
      );
    }
    go.disabled = true;
    go.textContent = t.sending;
    try {
      // Account: guest with "create an account" → register first (a failure does not stop the order).
      if (!customer && mk?.checked && pass) {
        const r = await fetch("/api/shop/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            action: "register",
            site: ctx.siteId,
            name: st.name.trim(),
            email: st.email.trim(),
            phone: st.phone.trim(),
            password: pass.value,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (j.customer) {
          customer = j.customer;
          window.dispatchEvent(new CustomEvent("cms:account-change"));
        } else if (j.error) toast(j.error);
      }
      const tk = await token;
      const wait = 1100 - (Date.now() - tokenAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const ntf = field("ntf").checked
        ? f.querySelector<HTMLInputElement>('[name="ch"]:checked')?.value ||
          "whatsapp"
        : "";
      const consents = [
        ntf
          ? `${t.notify} ${ntf === "telegram" ? "Telegram" : "WhatsApp"} · ${t.notifyP}`
          : "",
        st.news ? t.news.replace("{shop}", data.shop || "") : "",
      ].filter(Boolean);
      const response = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: await checkoutBody(ctx.siteId, ctx.pageId, {
          paymentMethod: payment?.value() || "on_receipt",
          site: ctx.siteId,
          pageId: ctx.pageId,
          token: tk,
          locale: ctx.locale,
          via: "popup",
          items: [
            {
              productId: item.line.productId,
              variantId: item.line.variantId,
              expectedPrice: item.line.price,
              pageId: item.line.pageId,
              sectionId: item.line.sectionId,
              name: item.line.name,
              options: item.line.options,
              qty: 1,
            },
          ],
          customer: {
            type: st.who === "company" ? "company" : "private",
            name: st.name.trim(),
            phone: st.phone.trim(),
            email: st.email.trim(),
            ...(st.who === "company" && st.company
              ? { reg: st.company.reg }
              : {}),
          },
          delivery: {
            method: st.how,
            address: st.how === "delivery" ? st.addr.trim() : "",
            flat: st.how === "delivery" ? st.flat.trim() : "",
            point: st.how === "delivery" ? st.point : null,
          },
          consents,
          ...(ntf ? { notify: ntf } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || t.err);
      checkoutComplete(ctx.siteId, ctx.pageId);
      try {
        sessionStorage.removeItem(draftKey);
      } catch {}
      window.dispatchEvent(
        new CustomEvent("cms:track", { detail: { e: "order" } }),
      );
      if (customer) window.dispatchEvent(new CustomEvent("cms:account-change"));
      if (result.resultUrl) {
        location.assign(result.resultUrl);
        return;
      }
      done(result);
    } catch (error) {
      if (signal.aborted) return;
      toast(error instanceof Error && error.message ? error.message : t.err);
      go.disabled = false;
      go.textContent = t.send;
    }
  });

  // ---- "thank you" with the order number, in the same popup
  function done(r: {
    number: number;
    delivery: number;
    zone?: string;
    total: number;
  }) {
    sheet.classList.remove("is-co");
    const first = st.name.trim().split(" ")[0];
    const cab = customer && cabinetUrl ? `${cabinetUrl}#order-${r.number}` : "";
    body.innerHTML = `<div class="hco-done"><div class="hco-ok">${ICON.check}</div><h2 id="hco-title">${esc(t.doneH)}</h2><span class="hco-num">${esc(r.number)}</span>
      <p class="hco-msg">${esc(t.doneP.replace("{n}", first).replace("{w}", st.how === "pickup" ? t.doneWp : t.doneWd))}</p>
      <div class="hco-lines"><div><span>${esc(item.title)}</span><span>${eur(price)}</span></div><div><span>${esc(st.how === "pickup" ? t.pkH : t.dlH)}${r.zone ? ` · ${esc(r.zone)}` : ""}</span><span>${r.delivery ? eur(r.delivery) : esc(t.free)}</span></div>
        <div><span>${esc(t.pay)}</span><span>${esc(t.payV)}</span></div><div class="is-tot"><span>${esc(t.doneTot)}</span><span>${eur(r.total)}</span></div></div>
      ${cab ? `<a class="hco-btn hco-btn-p" href="${esc(cab)}">${esc(t.cab)}</a>` : ""}<button type="button" class="hco-btn hco-btn-s" data-done>${esc(t.ok)}</button></div>`;
    sheet.scrollTop = 0;
    body.querySelector("[data-done]")!.addEventListener("click", close);
    body
      .querySelector<HTMLAnchorElement>(".hco-btn-p")
      ?.addEventListener("click", () => close());
  }
  return close;
}
