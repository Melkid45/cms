import { type ConsultLang, optionLabel, questionText } from "./i18n";
// Onboarding autopilot (2026-11-19): AI consultation → brief → draft website → client review →
// translation → publish. Client-safe types and the scripted parts (questions, niches, page plans).
// Server code: store.ts, consult.ts, generate.ts, review.ts, translate.ts, fetch-site.ts.

export type Step = "consultation" | "draft" | "review" | "translation" | "live";
export const STEPS: { id: Step; label: string; text: string }[] = [
  { id: "consultation", label: "Consultation", text: "Tell us about your business — we ask, you answer by text or voice." },
  { id: "draft", label: "Draft", text: "We build the first version of your website from your brief." },
  { id: "review", label: "Your review", text: "Look through every page and comment on any block — it is rewritten for you." },
  { id: "translation", label: "Translation", text: "Approved pages are translated into your other languages." },
  { id: "live", label: "Live", text: "Your website is published." },
];

export type Niche =
  | "cafe"
  | "restaurant"
  | "beauty"
  | "dental"
  | "auto"
  | "construction"
  | "shop"
  | "studio"
  | "services";
export type PageType =
  | "home"
  | "about"
  | "services"
  | "prices"
  | "gallery"
  | "reviews"
  | "faq"
  | "contacts";
export const PAGE_TYPES: { id: PageType; label: string; slug: string }[] = [
  { id: "home", label: "Home", slug: "home" },
  { id: "about", label: "About", slug: "about" },
  { id: "services", label: "Services", slug: "services" },
  { id: "prices", label: "Prices", slug: "prices" },
  { id: "gallery", label: "Gallery", slug: "gallery" },
  { id: "reviews", label: "Reviews", slug: "reviews" },
  { id: "faq", label: "FAQ", slug: "faq" },
  { id: "contacts", label: "Contacts", slug: "contacts" },
];
// [variant, tone?] in page order.
type Block = [string, ("tint" | "dark" | "accent")?];
export interface NicheInfo {
  label: string;
  preset: string;
  header: string;
  footer: string;
  // Words in a business description that point to this niche (EN / LV / RU).
  keywords: string[];
  booking: boolean;
  home: Block[];
  // Per-niche overrides of the inner pages.
  pages?: Partial<Record<PageType, Block[]>>;
  menuName?: string;
}
// Home pages follow the designer-made demo websites (demo-cafe, demo-barber, …); the
// video hero (hero-v52) is replaced by a photo hero because a new client has no video yet.
export const NICHES: Record<Niche, NicheInfo> = {
  cafe: {
    label: "Café / bakery",
    preset: "warm-cafe",
    header: "header-v1",
    footer: "footer-v2",
    keywords: ["cafe", "café", "coffee", "bakery", "kafejn", "kafij", "maizn", "кафе", "кофе", "пекар", "кофейн"],
    booking: true,
    home: [["hero-v51"], ["about-v3"], ["services-v2", "tint"], ["pricing-v50"], ["gallery-v2"], ["testimonials-v1", "accent"], ["faq-v2"], ["contact-v5"]],
    pages: { prices: [["hero-v6"], ["pricing-v50"], ["faq-v1"], ["contact-v6"]] },
    menuName: "Menu",
  },
  restaurant: {
    label: "Restaurant / bar",
    preset: "elegant",
    header: "header-v2",
    footer: "footer-v5",
    keywords: ["restaurant", "bistro", "bar ", "dining", "restorān", "ресторан", "бистро"],
    booking: true,
    home: [["hero-v50"], ["about-v7"], ["pricing-v3"], ["pricing-v50"], ["gallery-v1"], ["testimonials-v6"], ["faq-v3"], ["contact-v50", "tint"]],
    pages: { prices: [["hero-v6"], ["pricing-v50"], ["faq-v1"], ["contact-v50"]] },
    menuName: "Menu",
  },
  beauty: {
    label: "Barber / beauty salon",
    preset: "classic",
    header: "header-v6",
    footer: "footer-v3",
    keywords: ["barber", "hair", "salon", "beauty", "nails", "manicure", "frizier", "skaistum", "барбер", "салон", "парикмах", "маникюр", "красот"],
    booking: true,
    home: [["hero-v50"], ["about-v4"], ["services-v7", "tint"], ["team-v50"], ["pricing-v51"], ["gallery-v6"], ["testimonials-v10", "accent"], ["faq-v1"], ["contact-v50"]],
  },
  dental: {
    label: "Dental / medical clinic",
    preset: "clinical",
    header: "header-v3",
    footer: "footer-v4",
    keywords: ["dental", "dentist", "clinic", "medical", "doctor", "zobārst", "klīnik", "ārst", "стомат", "клиник", "врач", "медицин"],
    booking: true,
    home: [["hero-v51"], ["advantages-v3"], ["services-v4", "tint"], ["team-v50"], ["pricing-v1", "dark"], ["testimonials-v3", "accent"], ["faq-v4"], ["contact-v50"]],
  },
  auto: {
    label: "Car service / garage",
    preset: "workshop",
    header: "header-v4",
    footer: "footer-v1",
    keywords: ["car ", "auto", "garage", "tyre", "tire", "mechanic", "autoserviss", "riepu", "автосервис", "шиномонтаж", "ремонт авто", "машин"],
    booking: true,
    home: [["hero-v50"], ["services-v1", "tint"], ["process-v1"], ["pricing-v6", "dark"], ["gallery-v3"], ["gallery-v50"], ["testimonials-v8", "accent"], ["faq-v5"], ["contact-v8"]],
  },
  construction: {
    label: "Construction / renovation",
    preset: "nordic",
    header: "header-v4",
    footer: "footer-v2",
    keywords: ["construction", "renovation", "builder", "roof", "kitchen", "bathroom", "būvniec", "remont", "строит", "ремонт", "отделк"],
    booking: false,
    home: [["hero-v51"], ["services-v8", "tint"], ["projects-v1"], ["process-v4"], ["gallery-v50"], ["testimonials-v2", "accent"], ["faq-v1"], ["contact-v7"]],
    pages: { gallery: [["hero-v3"], ["projects-v1"], ["gallery-v3"], ["contact-v6"]] },
  },
  shop: {
    label: "Shop",
    preset: "playful",
    header: "header-v1",
    footer: "footer-v2",
    keywords: ["shop", "store", "sell", "products", "veikal", "preces", "магазин", "товар", "продаж"],
    booking: false,
    home: [["hero-v5"], ["pricing-v9"], ["advantages-v1", "tint"], ["gallery-v3"], ["testimonials-v1", "accent"], ["faq-v2"], ["contact-v7"]],
  },
  studio: {
    label: "Design / creative studio",
    preset: "studio",
    header: "header-v4",
    footer: "footer-v2",
    keywords: ["studio", "design", "agency", "architect", "photograph", "studija", "dizain", "студия", "дизайн", "агентств", "фотограф"],
    booking: false,
    home: [["hero-v50"], ["about-v1"], ["services-v2", "tint"], ["projects-v1"], ["process-v1"], ["team-v50"], ["testimonials-v1", "accent"], ["contact-v3"]],
  },
  services: {
    label: "Other services",
    preset: "nordic",
    header: "header-v1",
    footer: "footer-v2",
    keywords: [],
    booking: false,
    home: [["hero-v2"], ["about-v1"], ["services-v2", "tint"], ["advantages-v3"], ["testimonials-v1", "accent"], ["faq-v1"], ["contact-v3"]],
  },
};
// Inner pages (same for every niche unless the niche overrides them).
export const INNER_PAGES: Record<Exclude<PageType, "home">, Block[]> = {
  about: [["hero-v3"], ["about-v3"], ["team-v50"], ["gallery-v2"], ["contact-v6"]],
  services: [["hero-v6"], ["services-v6"], ["process-v5"], ["faq-v4"], ["contact-v7"]],
  prices: [["hero-v6"], ["pricing-v51"], ["faq-v1"], ["contact-v6"]],
  gallery: [["hero-v3"], ["gallery-v3"], ["testimonials-v1"], ["contact-v6"]],
  reviews: [["hero-v3"], ["testimonials-v3"], ["contact-v6"]],
  faq: [["hero-v6"], ["faq-v4"], ["contact-v6"]],
  contacts: [["hero-v6"], ["contact-v7"], ["faq-v1"]],
};
export function pageBlocks(niche: Niche, type: PageType): Block[] {
  const info = NICHES[niche] ?? NICHES.services;
  if (type === "home") return info.home;
  if (type === "contacts" && info.booking)
    return [["hero-v6"], ["contact-v50"], ["faq-v1"]];
  return info.pages?.[type] ?? INNER_PAGES[type];
}
export function guessNiche(text: string): Niche | undefined {
  const value = ` ${text.toLowerCase()} `;
  let best: Niche | undefined;
  let score = 0;
  for (const [id, info] of Object.entries(NICHES) as [Niche, NicheInfo][]) {
    const hits = info.keywords.filter((k) => value.includes(k)).length;
    if (hits > score) {
      score = hits;
      best = id;
    }
  }
  return best;
}

// ---- Consultation script ----
export type TopicKind = "text" | "textarea" | "choice" | "multi" | "photos" | "link";
export interface Topic {
  id: string;
  kind: TopicKind;
  optional?: boolean;
  // Question text and options may depend on earlier answers (niche, languages).
  ask: (ctx: { answers: Record<string, string>; niche?: Niche; lang: ConsultLang }) => {
    text: string;
    hint?: string;
    options?: string[];
  } | null;
}
export const LANGUAGE_OPTIONS = [
  { id: "lv", label: "Latvian" },
  { id: "ru", label: "Russian" },
  { id: "en", label: "English" },
  { id: "de", label: "German" },
];
const goalOptions = (niche?: Niche) =>
  niche && NICHES[niche].booking
    ? ["Book a visit / table online", "Call or message us", "Send an enquiry", "Look at our work"]
    : niche === "shop"
      ? ["Order a product", "Call or message us", "Visit the shop", "Send an enquiry"]
      : ["Send an enquiry", "Call or message us", "Look at our work", "Book a meeting"];
export const TOPICS: Topic[] = [
  { id: "business", kind: "textarea", ask: ({ lang }) => questionText(lang, "business") },
  { id: "source", kind: "link", optional: true, ask: ({ lang }) => questionText(lang, "source") },
  {
    id: "niche",
    kind: "choice",
    ask: ({ niche, lang }) => ({
      ...(niche
        ? questionText(lang, "niche:guess", niche, { niche: optionLabel(lang, NICHES[niche].label).toLowerCase() })
        : questionText(lang, "niche")),
      options: Object.values(NICHES).map((n) => n.label),
    }),
  },
  { id: "offer", kind: "textarea", ask: ({ niche, lang }) => questionText(lang, "offer", niche) },
  { id: "audience", kind: "textarea", ask: ({ lang }) => questionText(lang, "audience") },
  {
    id: "unique",
    kind: "textarea",
    ask: ({ niche, lang }) => questionText(lang, niche === "cafe" || niche === "restaurant" ? "unique:food" : "unique"),
  },
  { id: "competitors", kind: "textarea", optional: true, ask: ({ lang }) => questionText(lang, "competitors") },
  {
    id: "tone",
    kind: "choice",
    ask: ({ lang }) => ({
      ...questionText(lang, "tone"),
      options: ["Warm and friendly", "Calm and professional", "Premium and elegant", "Bold and energetic", "Playful"],
    }),
  },
  { id: "colors", kind: "textarea", optional: true, ask: ({ lang }) => questionText(lang, "colors") },
  { id: "photos", kind: "photos", optional: true, ask: ({ lang }) => questionText(lang, "photos") },
  { id: "contacts", kind: "textarea", ask: ({ lang }) => questionText(lang, "contacts") },
  {
    id: "hours",
    kind: "textarea",
    optional: true,
    ask: ({ niche, lang }) => questionText(lang, niche === "studio" || niche === "shop" ? "hours:optional" : "hours"),
  },
  {
    id: "languages",
    kind: "multi",
    ask: ({ lang }) => ({ ...questionText(lang, "languages"), options: LANGUAGE_OPTIONS.map((l) => l.label) }),
  },
  { id: "goal", kind: "choice", ask: ({ niche, lang }) => ({ ...questionText(lang, "goal"), options: goalOptions(niche) }) },
  {
    id: "pages",
    kind: "multi",
    ask: ({ niche, lang }) => ({
      ...questionText(lang, "pages"),
      options: PAGE_TYPES.filter((p) => p.id !== "home").map((p) =>
        p.id === "prices" && niche && NICHES[niche].menuName ? NICHES[niche].menuName! : p.label,
      ),
    }),
  },
];
export const nicheFromLabel = (label: string): Niche | undefined =>
  (Object.entries(NICHES) as [Niche, NicheInfo][]).find(([, n]) => n.label === label)?.[0];
export const languagesFromAnswer = (answer = "") =>
  answer
    .split(",")
    .map((part) => LANGUAGE_OPTIONS.find((l) => l.label === part.trim())?.id)
    .filter((id): id is string => !!id);
export function pagesFromAnswer(answer = "", niche?: Niche): PageType[] {
  const menu = niche ? NICHES[niche].menuName : undefined;
  const picked = answer
    .split(",")
    .map((part) => part.trim())
    .map((label) =>
      label === menu ? "prices" : PAGE_TYPES.find((p) => p.label === label)?.id,
    )
    .filter((id): id is PageType => !!id && id !== "home");
  return ["home", ...new Set(picked)].slice(0, 6) as PageType[];
}

// ---- Brief ----
export interface BriefOffer {
  name: string;
  price: string;
  description: string;
  category: string;
}
export interface Brief {
  business: string;
  niche: Niche;
  summary: string;
  audience: string;
  offers: BriefOffer[];
  unique: string[];
  tone: string;
  colors: string;
  // Accent colour suggested from the client's colours (#rrggbb) or "".
  accent: string;
  competitors: string;
  phone: string;
  email: string;
  address: string;
  hours: string;
  social: string[];
  languages: string[];
  goal: string;
  pages: PageType[];
  // Facts the website needs that the client has not given (prices, years, …).
  unknowns: string[];
}

// ---- Records ----
export interface ChatMessage {
  id: string;
  role: "assistant" | "customer";
  text: string;
  topic?: string;
  via?: "voice" | "text";
  at: string;
}
export interface AiLogEntry {
  at: string;
  purpose: string;
  model: string;
  cost: number;
  tokensIn: number;
  tokensOut: number;
}
export type ReviewStatus = "pending" | "approved" | "changes";
export interface ReviewEvent {
  at: string;
  by: string;
  kind: "created" | "comment" | "revision" | "approved" | "reopened" | "undo";
  text?: string;
  // Section content before a revision (for undo).
  before?: { values: Record<string, string>; collections?: Record<string, unknown> };
}
export interface ReviewItem {
  id: string;
  pageId: string;
  sectionId: string;
  locale: string;
  label: string;
  status: ReviewStatus;
  version: number;
  updatedAt: string;
  history: ReviewEvent[];
}
export interface OnboardingPage {
  pageId: string;
  type: PageType;
  locale: string;
  title: string;
  slug: string;
}
export interface Onboarding {
  id: string;
  createdAt: string;
  updatedAt: string;
  siteId: string;
  companyId: string;
  orderId?: string;
  // sha256 of the client's private link token.
  tokenHash: string;
  // Test record: AI answers are canned (no network, no cost). Set by the super admin only.
  mock: boolean;
  test: boolean;
  // Language of the consultation (questions, assistant messages); set at start or by the client.
  lang?: ConsultLang;
  step: Step;
  business: string;
  messages: ChatMessage[];
  answers: Record<string, string>;
  // Answers proposed from the old website (the client confirms or edits them).
  suggested: Record<string, string>;
  // Follow-up questions written by AI after the script ("follow-1"…).
  followUps: { id: string; text: string }[];
  followUpsAsked: boolean;
  imported?: { url: string; at: string; pages: { url: string; title: string }[]; images: string[] };
  photos: string[];
  brief?: Brief;
  briefConfirmed: boolean;
  plan?: { niche: Niche; preset: string; fonts: string; pages: PageType[]; main: string };
  pages: OnboardingPage[];
  review: ReviewItem[];
  translations: string[];
  ai: { calls: number; cost: number; log: AiLogEntry[] };
  events: { at: string; text: string; by: string }[];
  publishedAt?: string;
}
// What the client/team UI receives (no token hash).
export type OnboardingView = Omit<Onboarding, "tokenHash"> & {
  siteKey: string;
  siteName: string;
  question: {
    topic: string;
    kind: TopicKind;
    text: string;
    hint?: string;
    // Stored values (English) and the labels shown in the consultation language.
    options?: string[];
    optionLabels?: string[];
    suggestion?: string;
    optional?: boolean;
  } | null;
  aiEnabled: boolean;
};
// Values in square brackets are placeholders the client still has to fill in.
export const PLACEHOLDER = /\[(?!\/)[^\]\n]{1,60}\]/g;
