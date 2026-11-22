// Multilingual websites: page URLs, translation lookup and small interface strings.
// Client-safe (used by the public renderer, the editor and the server).
import type { CmsPage, Languages, Project } from "./types";

export const LOCALES = ["lv", "ru", "en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<string, string> = {
  lv: "Latviešu",
  ru: "Русский",
  en: "English",
  de: "Deutsch",
};
export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);

type PageRef = Pick<CmsPage, "id" | "slug" | "locale"> & {
  translationGroup?: string;
};

// The website is multilingual once two or more languages are enabled.
export function siteLanguages(project: Pick<Project, "languages">) {
  const languages = project.languages;
  if (!languages || languages.enabled.length < 2) return null;
  return languages;
}

// Locale prefix of a page URL: none for the default language (and for
// single-language websites), otherwise the page's own locale.
export function pagePrefix(
  languages: Languages | null | undefined,
  locale: string,
) {
  return languages &&
    languages.enabled.length > 1 &&
    locale !== languages.default &&
    languages.enabled.includes(locale)
    ? locale
    : "";
}

// Public URL of a page: /site/{key}/{slug} or /site/{key}/{locale}/{slug}.
export function pageHref(
  project: Pick<Project, "languages">,
  siteKey: string | undefined,
  page: Pick<PageRef, "slug" | "locale">,
) {
  const prefix = siteKey ? pagePrefix(project.languages, page.locale) : "";
  const path = prefix ? `${prefix}/${page.slug}` : page.slug;
  return siteKey ? `/site/${siteKey}/${path}` : `/site/${path}`;
}

// Every page of a translation group (including the page itself).
export function translationsOf<T extends PageRef>(
  pages: T[],
  page: PageRef,
): T[] {
  if (!page.translationGroup)
    return pages.filter((p) => p.id === page.id);
  return pages.filter((p) => p.translationGroup === page.translationGroup);
}

// The page in another language: its translation, or else that language's home.
export function translationFor<T extends PageRef>(
  project: { pages: T[]; layout: { homePageId: string } },
  page: PageRef | undefined,
  locale: string,
): T | undefined {
  if (page) {
    const own = translationsOf(project.pages, page).find(
      (p) => p.locale === locale,
    );
    if (own) return own;
  }
  return languageHome(project, locale);
}

// Home page of a language: the home page itself or its translation.
export function languageHome<T extends PageRef>(
  project: { pages: T[]; layout: { homePageId: string } },
  locale: string,
): T | undefined {
  const home = project.pages.find((p) => p.id === project.layout.homePageId);
  if (!home) return undefined;
  if (home.locale === locale) return home;
  return translationsOf(project.pages, home).find((p) => p.locale === locale);
}

// Header/footer values for a language: default values with that language's overrides.
export function localizedLayoutValues(
  project: Pick<Project, "layout" | "languages">,
  placement: "header" | "footer",
  locale: string | undefined,
) {
  const base = project.layout[placement].values;
  if (!locale || locale === project.languages?.default) return base;
  const override = project.layout.localized?.[locale]?.[placement];
  return override ? { ...base, ...override } : base;
}

// Interface strings of the public website (forms), by page language.
const STRINGS = {
  en: {
    preview: "Preview only. Messages are not sent from the editor.",
    unavailable:
      "Enquiries are currently unavailable. Please contact us directly.",
    sending: "Sending…",
    failed: "Could not send your message. Please try again.",
    language: "Language",
    cart: "Cart",
    added: "Added to cart",
    openCart: "Open cart",
    remove: "Remove",
    empty: "Your cart is empty.",
    total: "Total",
    quantity: "Quantity",
    address: "Delivery address",
    orderSent: "Thank you! Order #{n} has been received. We will call you to confirm it.",
    orderSubject: "Your order #{n}",
    orderIntro: "Thank you for your order. We will call you to confirm the details. Payment on delivery or pickup.",
    deliveryZone: "Delivery zone",
    delivery: "Delivery",
    pickup: "Pickup",
    free: "Free",
    subtotal: "Products",
    toCheckout: "Checkout",
    keepBrowsing: "Continue browsing",
    close: "Close",
  },
  lv: {
    preview: "Tikai priekšskatījums. Ziņas no redaktora netiek sūtītas.",
    unavailable: "Pieteikumi pašlaik netiek pieņemti. Lūdzu, sazinieties ar mums tieši.",
    sending: "Sūta…",
    failed: "Neizdevās nosūtīt ziņu. Lūdzu, mēģiniet vēlreiz.",
    language: "Valoda",
    cart: "Grozs",
    added: "Pievienots grozam",
    openCart: "Atvērt grozu",
    remove: "Noņemt",
    empty: "Jūsu grozs ir tukšs.",
    total: "Kopā",
    quantity: "Daudzums",
    address: "Piegādes adrese",
    orderSent: "Paldies! Pasūtījums Nr. {n} ir saņemts. Mēs piezvanīsim, lai to apstiprinātu.",
    orderSubject: "Jūsu pasūtījums Nr. {n}",
    orderIntro: "Paldies par pasūtījumu! Mēs piezvanīsim, lai precizētu detaļas. Apmaksa saņemot vai izņemot.",
    deliveryZone: "Piegādes zona",
    delivery: "Piegāde",
    pickup: "Saņemšana uz vietas",
    free: "Bez maksas",
    subtotal: "Preces",
    toCheckout: "Noformēt pasūtījumu",
    keepBrowsing: "Turpināt iepirkties",
    close: "Aizvērt",
  },
  ru: {
    preview: "Только предпросмотр. Из редактора сообщения не отправляются.",
    unavailable: "Заявки сейчас не принимаются. Свяжитесь с нами напрямую.",
    sending: "Отправка…",
    failed: "Не удалось отправить сообщение. Попробуйте ещё раз.",
    language: "Язык",
    cart: "Корзина",
    added: "Добавлено в корзину",
    openCart: "Открыть корзину",
    remove: "Удалить",
    empty: "Корзина пуста.",
    total: "Итого",
    quantity: "Количество",
    address: "Адрес доставки",
    orderSent: "Спасибо! Заказ № {n} получен. Мы позвоним, чтобы подтвердить его.",
    orderSubject: "Ваш заказ № {n}",
    orderIntro: "Спасибо за заказ! Мы позвоним, чтобы уточнить детали. Оплата при получении.",
    deliveryZone: "Зона доставки",
    delivery: "Доставка",
    pickup: "Самовывоз",
    free: "Бесплатно",
    subtotal: "Товары",
    toCheckout: "Оформить заказ",
    keepBrowsing: "Продолжить покупки",
    close: "Закрыть",
  },
  de: {
    preview: "Nur Vorschau. Aus dem Editor werden keine Nachrichten gesendet.",
    unavailable:
      "Anfragen sind derzeit nicht möglich. Bitte kontaktieren Sie uns direkt.",
    sending: "Wird gesendet…",
    failed: "Nachricht konnte nicht gesendet werden. Bitte erneut versuchen.",
    language: "Sprache",
    cart: "Warenkorb",
    added: "In den Warenkorb gelegt",
    openCart: "Warenkorb öffnen",
    remove: "Entfernen",
    empty: "Ihr Warenkorb ist leer.",
    total: "Summe",
    quantity: "Menge",
    address: "Lieferadresse",
    orderSent: "Vielen Dank! Bestellung Nr. {n} ist eingegangen. Wir rufen Sie zur Bestätigung an.",
    orderSubject: "Ihre Bestellung Nr. {n}",
    orderIntro: "Vielen Dank für Ihre Bestellung. Wir rufen Sie zur Bestätigung an. Bezahlung bei Lieferung oder Abholung.",
    deliveryZone: "Lieferzone",
    delivery: "Lieferung",
    pickup: "Abholung",
    free: "Kostenlos",
    subtotal: "Waren",
    toCheckout: "Zur Kasse",
    keepBrowsing: "Weiter einkaufen",
    close: "Schließen",
  },
};
export function uiText(locale: string | undefined) {
  return STRINGS[(locale && isLocale(locale) ? locale : "en") as Locale];
}

// Enquiry form replies (api/forms) in the page language. The English text is the key;
// unknown messages pass through unchanged.
const FORM_MESSAGES: Record<string, Partial<Record<Locale, string>>> = {
  "Thank you. Your message has been received.": {
    lv: "Paldies! Jūsu ziņa ir saņemta.",
    ru: "Спасибо! Ваше сообщение получено.",
    de: "Vielen Dank. Ihre Nachricht ist eingegangen.",
  },
  "Check the form fields.": {
    lv: "Pārbaudiet formas laukus.",
    ru: "Проверьте поля формы.",
    de: "Bitte prüfen Sie die Formularfelder.",
  },
  "Please reload the page and try again.": {
    lv: "Lūdzu, pārlādējiet lapu un mēģiniet vēlreiz.",
    ru: "Обновите страницу и попробуйте ещё раз.",
    de: "Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
  },
  "Form unavailable.": {
    lv: "Forma nav pieejama.",
    ru: "Форма недоступна.",
    de: "Formular nicht verfügbar.",
  },
  "Please fill in all required fields.": {
    lv: "Lūdzu, aizpildiet visus obligātos laukus.",
    ru: "Заполните все обязательные поля.",
    de: "Bitte füllen Sie alle Pflichtfelder aus.",
  },
  "Enter a valid email address.": {
    lv: "Ievadiet derīgu e-pasta adresi.",
    ru: "Введите правильный адрес эл. почты.",
    de: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
  },
  "Enter a valid phone number.": {
    lv: "Ievadiet derīgu tālruņa numuru.",
    ru: "Введите правильный номер телефона.",
    de: "Bitte geben Sie eine gültige Telefonnummer ein.",
  },
  "Check the numbers in the form.": {
    lv: "Pārbaudiet skaitļus formā.",
    ru: "Проверьте числа в форме.",
    de: "Bitte prüfen Sie die Zahlen im Formular.",
  },
  "Your message is empty.": {
    lv: "Jūsu ziņa ir tukša.",
    ru: "Сообщение пустое.",
    de: "Ihre Nachricht ist leer.",
  },
  "Too many attempts. Please try again later.": {
    lv: "Pārāk daudz mēģinājumu. Lūdzu, mēģiniet vēlāk.",
    ru: "Слишком много попыток. Попробуйте позже.",
    de: "Zu viele Versuche. Bitte versuchen Sie es später erneut.",
  },
  "Please try again later.": {
    lv: "Lūdzu, mēģiniet vēlāk.",
    ru: "Попробуйте позже.",
    de: "Bitte versuchen Sie es später erneut.",
  },
  "Could not complete this operation.": {
    lv: "Neizdevās nosūtīt. Lūdzu, mēģiniet vēlreiz.",
    ru: "Не удалось отправить. Попробуйте ещё раз.",
    de: "Senden fehlgeschlagen. Bitte erneut versuchen.",
  },
};
export function formMessage(locale: string | undefined, message: string) {
  return (locale && isLocale(locale) && FORM_MESSAGES[message]?.[locale]) || message;
}
// Success text of a form on a page: the site's text for that language, else the
// site's default text (default language / single-language sites), else a built-in one.
export function formSuccess(
  project: Pick<Project, "forms" | "languages">,
  locale: string,
) {
  const forms = project.forms;
  const own = forms?.messages?.[locale]?.trim();
  if (own) return own;
  const base = forms?.successMessage || "Thank you. Your message has been received.";
  const languages = siteLanguages(project);
  if (!languages || locale === languages.default) return base;
  return formMessage(locale, "Thank you. Your message has been received.");
}
