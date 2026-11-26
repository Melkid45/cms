// SEO audit of a page and of a whole website. Client-safe: the page editor runs it on
// the live draft, the SEO overview on every page. Each check carries a "fix" link to the
// editor field that fixes it (#seo-* fields of the SEO panel, #section-{id} for a section).
import { isLocale, pageHref, siteLanguages, translationsOf, LOCALE_NAMES } from "../i18n";
import type { CmsPage, Project, Section } from "../types";
import { pageContent, type PageContent } from "./content";
import { normalizePath } from "./schema";

export const LIMITS = {
  title: { min: 30, max: 60 },
  description: { min: 70, max: 160 },
  ogTitle: 60,
  ogDescription: 200,
  imageBytes: 500 * 1024,
  pageImageBytes: 3 * 1024 * 1024,
  words: 120,
};
export type CheckStatus = "ok" | "warn" | "error";
export interface AuditCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: { href: string; label: string };
}
export interface PageAudit {
  pageId: string;
  title: string;
  slug: string;
  locale: string;
  published: boolean;
  noindex: boolean;
  score: number;
  checks: AuditCheck[];
  content: PageContent;
}
// The page as audited: the published version when there is one (what search engines see),
// or the draft.
export type AuditPage = Pick<CmsPage, "id" | "title" | "slug" | "locale" | "seo" | "translationGroup"> & {
  sections: Section[];
};
export const seoTitle = (page: Pick<CmsPage, "title" | "seo">) =>
  (page.seo.title || page.title).trim();
const editorHref = (slug: string, anchor: string) =>
  `/dashboard/pages/${slug}#${anchor}`;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

// Internal link targets that resolve on this website: /site/{key}/[lang/]slug of a
// published page, a language home, a redirect source, or an in-page #anchor.
function linkResolver(project: Project, siteKey: string) {
  const published = project.pages.filter((p) => !p.deletedAt && p.published);
  const paths = new Set<string>();
  for (const p of published) {
    paths.add(pageHref(project, siteKey, p.published!).toLowerCase());
    if (p.id === project.layout.homePageId) paths.add(`/site/${siteKey}`);
  }
  for (const code of siteLanguages(project)?.enabled ?? [])
    paths.add(`/site/${siteKey}/${code}`);
  const redirects = new Set((project.seo?.redirects ?? []).map((r) => r.from));
  return (href: string) => {
    if (!href.startsWith("/") || href.startsWith("//")) return true;
    const path = normalizePath(href);
    if (path === "/" ) return true;
    if (!path.startsWith(`/site/${siteKey}`)) return !path.startsWith("/site/");
    if (paths.has(path)) return true;
    return redirects.has(path.slice(`/site/${siteKey}`.length) || "/");
  };
}

export function auditPage(
  project: Project,
  page: AuditPage,
  siteKey: string,
  options: { titles?: Map<string, string[]>; descriptions?: Map<string, string[]>; published?: boolean } = {},
): PageAudit {
  const checks: AuditCheck[] = [];
  const slug = project.pages.find((p) => p.id === page.id)?.slug || page.slug;
  const add = (check: AuditCheck) => checks.push(check);
  const content = pageContent(page.sections);
  const title = seoTitle(page);
  const titleFix = { href: editorHref(slug, "seo-title"), label: "Edit SEO title" };
  if (!page.seo.title.trim())
    add({ id: "title", label: "SEO title", status: "warn", detail: `No SEO title: search engines get the page name "${page.title}".`, fix: titleFix });
  else if (title.length < LIMITS.title.min || title.length > LIMITS.title.max)
    add({
      id: "title",
      label: "SEO title",
      status: title.length > LIMITS.title.max + 10 ? "error" : "warn",
      detail: `${title.length} characters; aim for ${LIMITS.title.min}–${LIMITS.title.max} so Google shows it in full.`,
      fix: titleFix,
    });
  else add({ id: "title", label: "SEO title", status: "ok", detail: `${title.length} characters.` });

  const description = page.seo.description.trim();
  const descriptionFix = { href: editorHref(slug, "seo-description"), label: "Edit description" };
  if (!description)
    add({ id: "description", label: "Meta description", status: "error", detail: "Missing: Google will pick a random text from the page.", fix: descriptionFix });
  else if (description.length < LIMITS.description.min || description.length > LIMITS.description.max)
    add({
      id: "description",
      label: "Meta description",
      status: "warn",
      detail: `${description.length} characters; aim for ${LIMITS.description.min}–${LIMITS.description.max}.`,
      fix: descriptionFix,
    });
  else add({ id: "description", label: "Meta description", status: "ok", detail: `${description.length} characters.` });

  const sameTitle = (options.titles?.get(title.toLowerCase()) ?? []).filter((s) => s !== slug);
  if (sameTitle.length)
    add({ id: "duplicate-title", label: "Unique title", status: "warn", detail: `Same title as: ${sameTitle.slice(0, 3).join(", ")}${sameTitle.length > 3 ? ` and ${sameTitle.length - 3} more` : ""}.`, fix: titleFix });
  const sameDescription = description
    ? (options.descriptions?.get(description.toLowerCase()) ?? []).filter((s) => s !== slug)
    : [];
  if (sameDescription.length)
    add({ id: "duplicate-description", label: "Unique description", status: "warn", detail: `Same description as: ${sameDescription.slice(0, 3).join(", ")}.`, fix: descriptionFix });

  const h1 = content.headings.filter((h) => h.level === 1);
  const firstSection = page.sections.find((s) => !s.hidden)?.id;
  if (h1.length === 1)
    add({ id: "h1", label: "One H1", status: "ok", detail: `"${h1[0].text.slice(0, 80)}"` });
  else
    add({
      id: "h1",
      label: "One H1",
      status: h1.length ? "warn" : "error",
      detail: h1.length ? `${h1.length} H1 headings; keep one main heading.` : content.emptyH1 ? "The H1 is empty: the first section's heading has no text." : "No H1: the first section has no heading.",
      fix: firstSection ? { href: editorHref(slug, `section-${(h1[1] ?? h1[0])?.sectionId ?? firstSection}`), label: "Open section" } : undefined,
    });
  const skip = content.headings.find((h, i) => i > 0 && h.level > content.headings[i - 1].level + 1);
  if (skip) {
    const before = content.headings[content.headings.indexOf(skip) - 1];
    add({ id: "headings", label: "Heading order", status: "warn", detail: `H${before.level} is followed by H${skip.level} ("${skip.text.slice(0, 50)}"): a level is skipped.`, fix: { href: editorHref(slug, `section-${skip.sectionId}`), label: "Open section" } });
  } else add({ id: "headings", label: "Heading order", status: "ok", detail: `${content.headings.length} headings in order.` });

  const noAlt = content.images.filter((i) => !i.alt);
  if (noAlt.length)
    add({ id: "alt", label: "Image alt texts", status: "warn", detail: `${noAlt.length} of ${content.images.length} images have no alt text.`, fix: { href: editorHref(slug, `section-${noAlt[0].sectionId}`), label: "Open section" } });
  else add({ id: "alt", label: "Image alt texts", status: "ok", detail: `${content.images.length} images, all described.` });

  const resolves = linkResolver(project, siteKey);
  const broken = content.links.filter((l) => !resolves(l.href));
  if (broken.length)
    add({ id: "links", label: "Internal links", status: "error", detail: `${broken.length} broken: ${[...new Set(broken.map((l) => l.href))].slice(0, 3).join(", ")}`, fix: { href: editorHref(slug, `section-${broken[0].sectionId}`), label: "Open section" } });
  else add({ id: "links", label: "Internal links", status: "ok", detail: `${content.links.length} links checked.` });

  // Page weight: images of the media library (stored as WebP, size known); others are not counted.
  const unique = [...new Set(content.images.map((i) => i.src))];
  const sizes = unique.map((src) => ({ src, size: project.media.find((m) => m.url === src)?.size ?? 0 }));
  const total = sizes.reduce((sum, s) => sum + s.size, 0);
  const heavy = sizes.filter((s) => s.size > LIMITS.imageBytes);
  if (heavy.length || total > LIMITS.pageImageBytes)
    add({ id: "weight", label: "Page weight", status: "warn", detail: `Images ${kb(total)}${heavy.length ? `; ${heavy.length} over ${kb(LIMITS.imageBytes)}` : ""}.`, fix: { href: "/dashboard/media", label: "Media library" } });
  else add({ id: "weight", label: "Page weight", status: "ok", detail: `Images ${kb(total)} in ${unique.length} files.` });

  if (content.words < LIMITS.words)
    add({ id: "words", label: "Text content", status: "warn", detail: `${content.words} words; thin pages rank poorly (aim for ${LIMITS.words}+).`, fix: firstSection ? { href: editorHref(slug, `section-${firstSection}`), label: "Open sections" } : undefined });
  else add({ id: "words", label: "Text content", status: "ok", detail: `${content.words} words.` });

  const languages = siteLanguages(project);
  if (languages) {
    const have = new Set(
      translationsOf(project.pages.filter((p) => !p.deletedAt), project.pages.find((p) => p.id === page.id) ?? { ...page })
        .filter((p) => p.published)
        .map((p) => p.locale),
    );
    const missing = languages.enabled.filter((l) => !have.has(l) && l !== page.locale);
    if (missing.length)
      add({ id: "translations", label: "Translations", status: "warn", detail: `No published ${missing.map((l) => (isLocale(l) ? LOCALE_NAMES[l] : l)).join(", ")} version.`, fix: { href: editorHref(slug, "page-translations"), label: "Translations" } });
    else add({ id: "translations", label: "Translations", status: "ok", detail: "All languages published." });
  }
  if (page.seo.noindex)
    add({ id: "noindex", label: "Indexing", status: "warn", detail: "Hidden from search engines (noindex) and left out of the sitemap.", fix: { href: editorHref(slug, "seo-noindex"), label: "Change" } });
  if (!page.seo.image && !content.heroImage)
    add({ id: "image", label: "Social image", status: "warn", detail: "No image: the share card uses a plain colour background.", fix: { href: editorHref(slug, "seo-image"), label: "Choose image" } });

  const penalty = checks.reduce((sum, c) => sum + (c.status === "error" ? 15 : c.status === "warn" ? 6 : 0), 0);
  return {
    pageId: page.id,
    title,
    slug,
    locale: page.locale,
    published: options.published ?? false,
    noindex: page.seo.noindex,
    score: Math.max(0, 100 - penalty),
    checks,
    content,
  };
}

// Every active page; published pages are audited as published.
export function auditSite(project: Project, siteKey: string): PageAudit[] {
  const pages = project.pages
    .filter((p) => !p.deletedAt)
    .map((p) => ({
      published: !!p.published,
      page: { ...(p.published ?? p), id: p.id, translationGroup: p.translationGroup } as AuditPage,
      slug: p.slug,
    }));
  const index = (key: (p: AuditPage) => string) => {
    const map = new Map<string, string[]>();
    for (const { page, slug } of pages.filter((p) => !p.page.seo.noindex)) {
      const k = key(page).toLowerCase();
      if (k) map.set(k, [...(map.get(k) ?? []), slug]);
    }
    return map;
  };
  const titles = index(seoTitle),
    descriptions = index((p) => p.seo.description.trim());
  return pages.map(({ page, published }) =>
    auditPage(project, page, siteKey, { titles, descriptions, published }),
  );
}

// ------------------------------------------------------------------ AI readiness (SEO pack)
// What answer engines (ChatGPT search, Perplexity, Gemini, Google AI Overviews) rely on:
// a complete business entity, question-style headings with short answers, FAQ markup,
// dated pages and text present in the server-rendered HTML.
const QUESTION = /\?$|^(kā|kas|kāpēc|kad|kur|cik|vai|kurš|kura|как|что|почему|когда|где|сколько|можно|какой|какая|how|what|why|when|where|which|who|can|do|does|is|are|wie|was|warum|wann|wo)\b/i;
export function entityChecks(project: Project): AuditCheck[] {
  const b = project.seo?.business;
  const href = "/dashboard/seo#seo-business";
  const missing = [
    !b?.name && !project.brand.name ? "name" : "",
    !(b?.street || project.website?.address) ? "address" : "",
    !(b?.phone || project.website?.phone) ? "phone" : "",
    b?.type !== "Organization" && !b?.hours ? "opening hours" : "",
    !b?.sameAs?.trim() ? "profile links (sameAs)" : "",
    !(b?.logo || project.brand.logo) ? "logo" : "",
    b?.type !== "Organization" && !(b?.lat && b?.lng) ? "map coordinates" : "",
  ].filter(Boolean);
  return [
    missing.length
      ? { id: "ai-entity", label: "Business details", status: missing.length > 2 ? "error" : "warn", detail: `Missing for Organization/LocalBusiness data: ${missing.join(", ")}.`, fix: { href, label: "Business details" } }
      : { id: "ai-entity", label: "Business details", status: "ok", detail: `${b?.type || "Organization"} with address, contacts, hours and profiles.` },
    project.seo?.hideSite
      ? { id: "ai-crawlers", label: "AI crawlers", status: "error", detail: "The website is hidden from all crawlers.", fix: { href: "/dashboard/seo#seo-indexing", label: "Indexing" } }
      : { id: "ai-crawlers", label: "AI crawlers", status: "ok", detail: `Search and answer bots (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, Claude-SearchBot) allowed${project.seo?.blockAiTraining ? "; training-only bots blocked" : ""}.` },
    // Bing's index feeds ChatGPT search: IndexNow pings on publish need the real https address.
    /^https:\/\//.test(project.website?.url || "") && !/trycloudflare\.com|localhost/.test(project.website?.url || "")
      ? { id: "ai-bing", label: "Bing / IndexNow", status: "ok", detail: "Published pages are sent to IndexNow (Bing) right away; verify the site in Bing Webmaster Tools too." }
      : { id: "ai-bing", label: "Bing / IndexNow", status: "warn", detail: "No public https Website URL yet: pages are not pushed to Bing (which ChatGPT search uses). Set it at launch and add the Bing verification code.", fix: { href: "/dashboard/settings/client#website-url", label: "Website URL" } },
  ];
}
export function aiChecks(audit: PageAudit, page: AuditPage, published: boolean): AuditCheck[] {
  const { content, slug } = audit;
  const section = (id?: string) => (id ? { href: editorHref(slug, `section-${id}`), label: "Open section" } : undefined);
  const firstSection = page.sections.find((s) => !s.hidden)?.id;
  const checks: AuditCheck[] = [];
  const sub = content.headings.filter((h) => h.level === 2 || h.level === 3);
  const questions = sub.filter((h) => QUESTION.test(h.text.trim()));
  checks.push(
    content.faqs.length >= 3
      ? { id: "ai-faq", label: "FAQ + FAQPage data", status: "ok", detail: `${content.faqs.length} questions, published as FAQPage JSON-LD.` }
      : { id: "ai-faq", label: "FAQ + FAQPage data", status: "warn", detail: content.faqs.length ? `Only ${content.faqs.length} question(s); 3+ give answer engines quotable Q&A.` : "No FAQ block: add one with the questions customers ask (FAQPage JSON-LD is generated).", fix: section(firstSection) },
  );
  checks.push(
    questions.length
      ? { id: "ai-questions", label: "Question headings", status: "ok", detail: `${questions.length} of ${sub.length} H2/H3 headings are questions.` }
      : { id: "ai-questions", label: "Question headings", status: "warn", detail: `None of ${sub.length} H2/H3 headings is phrased as a question people ask.`, fix: section(sub[0]?.sectionId ?? firstSection) },
  );
  const long = content.faqs.filter((f) => f.answer.length > 320);
  const h1 = content.headings.find((h) => h.level === 1);
  checks.push(
    long.length
      ? { id: "ai-answers", label: "Concise answers", status: "warn", detail: `${long.length} answer(s) longer than 320 characters: start with a 1–2 sentence direct answer.`, fix: section(long[0].sectionId) }
      : { id: "ai-answers", label: "Concise answers", status: "ok", detail: content.faqs.length ? "FAQ answers are short and direct." : "No long answers found." },
  );
  checks.push(
    h1 && h1.text.length >= 10
      ? { id: "ai-h1", label: "Clear H1", status: "ok", detail: `"${h1.text.slice(0, 70)}"` }
      : { id: "ai-h1", label: "Clear H1", status: "warn", detail: "The main heading is missing or too short to say what the page is about.", fix: section(h1?.sectionId ?? firstSection) },
  );
  checks.push(
    published
      ? { id: "ai-dated", label: "Updated date", status: "ok", detail: "dateModified (publish time) is in the WebPage data and the sitemap." }
      : { id: "ai-dated", label: "Updated date", status: "warn", detail: "Not published yet: no date for answer engines." },
  );
  checks.push(
    content.words >= LIMITS.words
      ? { id: "ai-text", label: "Server-rendered text", status: "ok", detail: `${content.words} words in the HTML (no JavaScript needed to read them).` }
      : { id: "ai-text", label: "Server-rendered text", status: "warn", detail: `Only ${content.words} words: AI crawlers mostly do not run scripts; write the answer into the page.`, fix: section(firstSection) },
  );
  return checks;
}
export const scoreOf = (checks: AuditCheck[]) =>
  Math.max(0, 100 - checks.reduce((sum, c) => sum + (c.status === "error" ? 15 : c.status === "warn" ? 8 : 0), 0));
