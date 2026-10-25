import { examplePages, type ExamplePage, type PageBlock, type PageSeo } from "./example-pages";
import { getDefinition, type BlockContent } from "./cms-library";
const key = "harbstone:pages:v1";
const changed = "harbstone:pages-changed";
export function storageSnapshot() { try { return localStorage.getItem(key) ?? ""; } catch { return ""; } }
export function subscribePages(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changed, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(changed, listener); };
}
function isContent(value: unknown): value is BlockContent {
  if (!value || typeof value !== "object") return false;
  const content = value as BlockContent;
  return ["eyebrow", "title", "text", "image", "imageAlt", "buttonLabel", "buttonUrl"].every((field) => typeof content[field as keyof BlockContent] === "string")
    && ["light", "soft", "dark"].includes(content.theme) && Array.isArray(content.items) && content.items.length <= 30
    && content.items.every((item) => item && ["id", "title", "text", "image", "imageAlt", "buttonLabel", "buttonUrl"].every((field) => typeof item[field as keyof typeof item] === "string"));
}
function isBlock(value: unknown): value is PageBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as PageBlock;
  return ["key", "family", "variant", "source"].every((field) => typeof block[field as keyof PageBlock] === "string") && (!getDefinition(block.source) || isContent(block.content));
}
function isSeo(value: unknown): value is PageSeo {
  if (!value || typeof value !== "object") return false;
  const seo = value as PageSeo;
  return ["title", "description", "keywords", "canonical", "ogTitle", "ogDescription", "ogImage", "ogImageAlt"].every((field) => typeof seo[field as keyof PageSeo] === "string") && ["website", "article"].includes(seo.ogType) && typeof seo.index === "boolean" && typeof seo.follow === "boolean";
}
export function readSavedPages(raw = storageSnapshot()): ExamplePage[] {
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.pages)) return [];
    return data.pages.filter((page: ExamplePage) => page && typeof page.title === "string" && typeof page.slug === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.slug) && ["en", "ru", "de"].includes(page.locale) && ["Draft", "Published"].includes(page.status) && Array.isArray(page.blocks) && page.blocks.length <= 100 && page.blocks.every(isBlock) && (page.seo === undefined || isSeo(page.seo)));
  } catch { return []; }
}
export function allPages(raw: string) {
  const pages = new Map(examplePages.map((page) => [page.slug, page]));
  readSavedPages(raw).forEach((page) => pages.set(page.slug, page));
  return [...pages.values()];
}
export function savePage(page: ExamplePage, previousSlug?: string) {
  const saved = readSavedPages();
  if (page.slug !== previousSlug && [...saved, ...examplePages].some((item) => item.slug === page.slug)) throw new Error("This slug already belongs to another page. Choose a unique slug.");
  const pages = saved.filter((item) => item.slug !== page.slug && item.slug !== previousSlug);
  localStorage.setItem(key, JSON.stringify({ version: 1, pages: [...pages, page] }));
  window.dispatchEvent(new Event(changed));
}
