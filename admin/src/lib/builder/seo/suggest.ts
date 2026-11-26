// Redirect suggestions (SEO pack): the old website's URLs → the closest page of this website.
// Client-safe. Matching: language prefix + last path segment against page slugs, then
// translated page titles; a bare "/lv" is that language's home page.
import { LOCALES, languageHome, pageHref } from "../i18n";
import type { Project } from "../types";
import { normalizePath } from "./schema";

export interface RedirectSuggestion {
  from: string;
  to: string; // page id, "" = no match (choose by hand)
  page: string; // page title shown in the list
  confidence: "exact" | "close" | "none";
}
const ASSET = /\.(svg|png|jpe?g|webp|gif|ico|css|js|json|xml|pdf|woff2?|ttf|txt|mp4)$/i;
const words = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9а-яё]+/)
    .filter((w) => w.length > 2);

export function suggestRedirects(project: Project, urls: string[]): RedirectSuggestion[] {
  const pages = project.pages.filter((p) => !p.deletedAt && p.published);
  const taken = new Set((project.seo?.redirects ?? []).map((r) => r.from));
  const out: RedirectSuggestion[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const from = normalizePath(raw);
    if (!from || ASSET.test(from) || seen.has(from) || taken.has(from)) continue;
    seen.add(from);
    const parts = from.split("/").filter(Boolean);
    const lang = (LOCALES as readonly string[]).includes(parts[0]) ? parts[0] : "";
    const rest = lang ? parts.slice(1) : parts;
    const inLang = pages.filter((p) => !lang || p.locale === lang);
    let page: (typeof pages)[number] | undefined;
    let confidence: RedirectSuggestion["confidence"] = "exact";
    if (!rest.length) page = languageHome(project, lang || project.languages?.default || pages[0]?.locale || "") ?? pages.find((p) => p.id === project.layout.homePageId);
    else {
      const last = rest[rest.length - 1];
      page =
        inLang.find((p) => p.slug === last) ??
        inLang.find((p) => p.slug === `${last}-${lang}`);
      if (!page) {
        // Same slug in another language: take that page's translation in this language.
        const other = pages.find((p) => p.slug === last);
        page =
          other && lang && other.translationGroup
            ? pages.find((p) => p.translationGroup === other.translationGroup && p.locale === lang)
            : other && !lang
              ? other
              : undefined;
      }
      if (!page) {
        confidence = "close";
        // Best word overlap between the old path and the page slug/title.
        const want = new Set(words(rest.join(" ")));
        let best = 0;
        for (const p of inLang) {
          const have = new Set([...words(p.slug.replace(/-/g, " ")), ...words(p.title)]);
          const hits = [...want].filter((w) => have.has(w)).length;
          const score = hits / Math.max(want.size, 1);
          if (score > best) {
            best = score;
            page = p;
          }
        }
        if (best < 0.5) page = undefined;
      }
    }
    // Same address as the page already has: no redirect needed.
    if (page && pageHref(project, "k", page).slice("/site/k".length) === from) continue;
    out.push({
      from,
      to: page?.id ?? "",
      page: page?.title ?? "",
      confidence: page ? confidence : "none",
    });
  }
  return out;
}
