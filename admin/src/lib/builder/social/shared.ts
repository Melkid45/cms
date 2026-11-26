// Social posts: types, formats, limits and the template caption generator.
// Client-safe (used by the dashboard and by the server).

export const NETWORKS = ["instagram", "facebook", "tiktok"] as const;
export type Network = (typeof NETWORKS)[number];
export const NETWORK_NAMES: Record<Network, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};
// Caption limits: Instagram 2,200 characters, Facebook ~63,206, TikTok 2,200
// (video caption; photo-post descriptions allow 4,000, the lower limit is kept).
export const CAPTION_LIMITS: Record<Network, number> = {
  instagram: 2200,
  facebook: 63206,
  tiktok: 2200,
};
// Instagram allows at most 30 hashtags per post.
export const HASHTAG_LIMIT = 30;
// Where the manual path opens each network.
export const NETWORK_LINKS: Record<Network, string> = {
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  tiktok: "https://www.tiktok.com/upload",
};

export const FORMATS = [
  { id: "square", label: "1:1", width: 1080, height: 1080, use: "Instagram / Facebook feed" },
  { id: "portrait", label: "4:5", width: 1080, height: 1350, use: "Instagram feed (largest)" },
  { id: "story", label: "9:16", width: 1080, height: 1920, use: "Stories, Reels, TikTok" },
  { id: "link", label: "1.91:1", width: 1200, height: 630, use: "Facebook link preview" },
] as const;
export type FormatId = (typeof FORMATS)[number]["id"];
// The render each network publishes.
export const NETWORK_FORMAT: Record<Network, FormatId> = {
  instagram: "portrait",
  facebook: "portrait",
  tiktok: "story",
};

export const POST_STATUSES = ["draft", "scheduled", "published", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export interface PostFields {
  title: string;
  description: string;
  price: string;
  // Public page URL without tracking parameters.
  link: string;
}
export interface PostSource {
  kind: "page" | "item" | "free";
  pageId?: string;
  sectionId?: string;
  itemId?: string;
  // Human label: "Datori → Ryzen 5 5500 · RTX 5050".
  label: string;
  // product = has a price, work = portfolio item / page without a price.
  type?: "product" | "work";
}
export interface PostRender {
  format: FormatId;
  image: string;
  mediaId: string;
  url: string;
  width: number;
  height: number;
}
export interface NetworkResult {
  status: "published" | "failed" | "scheduled";
  url?: string;
  externalId?: string;
  error?: string;
  at: string;
  manual?: boolean;
}
export interface HistoryEntry {
  at: string;
  by: string;
  text: string;
}
export interface SocialPost {
  id: string;
  siteId: string;
  // Internal name shown in the list.
  name: string;
  source: PostSource;
  // Locale the source content is written in.
  sourceLocale: string;
  languages: string[];
  // Content per language; missing languages fall back to the source language.
  fields: Record<string, PostFields>;
  networks: Network[];
  captions: Partial<Record<Network, string>>;
  hashtags: string;
  images: string[];
  focal: { x: number; y: number };
  brandBar: boolean;
  // cover = fill the frame around the focal point; contain = whole picture on its own
  // background colour (product shots on white). Absent = cover.
  fit?: "cover" | "contain";
  renders: PostRender[];
  status: PostStatus;
  scheduledAt?: string;
  results: Partial<Record<Network, NetworkResult>>;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
// One entry of the "Create post from…" picker.
export interface SourceOption {
  key: string;
  source: PostSource;
  locale: string;
  image: string;
  images: string[];
  fields: PostFields;
  // Same content in the page's translations (by locale).
  translations: Record<string, PostFields>;
}
export interface ConnectionStatus {
  network: Network;
  // App credentials are configured on the server.
  configured: boolean;
  connected: boolean;
  account?: string;
}

// Adds utm_source=<network>&utm_medium=social (keeps other parameters).
export function trackedLink(link: string, network: Network) {
  if (!link) return "";
  try {
    const url = new URL(link, "https://placeholder.invalid");
    url.searchParams.set("utm_source", network);
    url.searchParams.set("utm_medium", "social");
    const text = url.toString();
    return url.origin === "https://placeholder.invalid"
      ? text.slice(url.origin.length)
      : text;
  } catch {
    return link;
  }
}

const WORDS: Record<
  string,
  { price: string; buy: string; see: string; bio: string; seeWork: string }
> = {
  lv: {
    price: "Cena",
    buy: "Uzzini vairāk un pasūti",
    see: "Uzzini vairāk",
    bio: "Saite profilā",
    seeWork: "Apskati projektu",
  },
  ru: {
    price: "Цена",
    buy: "Подробнее и заказ",
    see: "Подробнее",
    bio: "Ссылка в профиле",
    seeWork: "Смотрите проект",
  },
  en: {
    price: "Price",
    buy: "Learn more and order",
    see: "Learn more",
    bio: "Link in bio",
    seeWork: "See the project",
  },
  de: {
    price: "Preis",
    buy: "Mehr erfahren und bestellen",
    see: "Mehr erfahren",
    bio: "Link in der Bio",
    seeWork: "Projekt ansehen",
  },
};
export const words = (locale: string) => WORDS[locale] ?? WORDS.en;

// Normalises "#a, b #c" into "#a #b #c" (unique, letters/digits/_ only).
export function normalizeHashtags(value: string) {
  const tags = value
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter(Boolean);
  return [...new Set(tags.map((t) => t.toLowerCase()))]
    .slice(0, HASHTAG_LIMIT)
    .map((t) => "#" + t)
    .join(" ");
}

// Suggested hashtags: brand + meaningful words of the title.
export function suggestHashtags(brand: string, title: string) {
  const words = title
    .split(/[\s·,/|–—-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w))
    .slice(0, 5);
  return normalizeHashtags([brand.replace(/\s+/g, ""), ...words].join(" "));
}

const clip = (text: string, max: number) =>
  text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";

// Template caption (no AI): title, short description, price, call to action with the
// tracked link (Instagram/TikTok: links are not clickable → "link in bio"), hashtags.
// Several languages are written one after another.
export function templateCaption(input: {
  network: Network;
  languages: string[];
  fields: Record<string, PostFields>;
  sourceLocale: string;
  hashtags: string;
  type?: "product" | "work";
}) {
  const blocks = input.languages.map((locale) => {
    const f = input.fields[locale] ?? input.fields[input.sourceLocale];
    if (!f) return "";
    const w = words(locale);
    const lines = [f.title.trim()];
    if (f.description.trim()) lines.push(clip(f.description.trim(), 400));
    if (f.price.trim()) lines.push(`${w.price}: ${f.price.trim()}`);
    const cta =
      input.type === "work" && !f.price.trim()
        ? w.seeWork
        : f.price.trim()
          ? w.buy
          : w.see;
    if (input.network === "facebook" && f.link)
      lines.push(`${cta}: ${trackedLink(f.link, "facebook")}`);
    else lines.push(`${cta} — ${w.bio.toLowerCase()}`);
    return lines.filter(Boolean).join("\n");
  });
  const tags = normalizeHashtags(input.hashtags);
  const text = [...blocks.filter(Boolean), tags].filter(Boolean).join("\n\n");
  return clip(text, CAPTION_LIMITS[input.network]);
}

export function captionProblems(network: Network, caption: string) {
  const problems: string[] = [];
  const limit = CAPTION_LIMITS[network];
  if (caption.length > limit)
    problems.push(`${caption.length - limit} characters over the limit`);
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (network === "instagram" && tags > HASHTAG_LIMIT)
    problems.push(`${tags} hashtags (Instagram allows ${HASHTAG_LIMIT})`);
  return problems;
}
