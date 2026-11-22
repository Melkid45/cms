import "server-only";
import { createSection } from "../catalog";
import { readProject, StoreError, writeProject } from "../server";
import { presetById } from "../style-presets";
import { FONT_PAIR_IDS } from "../font-pairs";
import type { CmsPage, Menu, Project, Section } from "../types";
import { NICHES, PAGE_TYPES, pageBlocks, type Brief, type Onboarding, type PageType, type ReviewItem } from "./shared";
import { applyAnswer, mockWrite, placePhotos, sectionSpec, type SectionAnswer } from "./content";
import { changeRecord, logEvent, newId, parseJson, readRecord, recordAi } from "./store";

// Menu label of the home page per language (AI tends to use the business name there).
export const HOME_TITLE: Record<string, string> = { lv: "Sākums", ru: "Главная", en: "Home", de: "Startseite" };
export const LANGUAGE_NAMES: Record<string, string> = { lv: "Latvian", ru: "Russian", en: "English", de: "German" };
export const briefForAi = (brief: Brief) =>
  JSON.stringify({
    business: brief.business,
    type: NICHES[brief.niche]?.label,
    summary: brief.summary,
    audience: brief.audience,
    offers: brief.offers,
    unique: brief.unique,
    tone: brief.tone,
    contacts: { phone: brief.phone, email: brief.email, address: brief.address, hours: brief.hours },
    goal: brief.goal,
    unknowns: brief.unknowns,
  });
export const WRITING_RULES = (language: string, tone: string) =>
  `Write in ${LANGUAGE_NAMES[language] || language}. Tone: ${tone || "friendly and clear"}. Use ONLY facts from the brief. Never invent prices, years, numbers, awards, names of people, reviews or addresses: where a fact is missing, write a short placeholder in square brackets, e.g. "[price]", "[year founded]", "[customer name]", "[review text]". Headings short and specific (2-6 words); keep line breaks ("\\n") in headings only where the example has them. Texts roughly as long as the current example. Plain text, no markdown, no emojis.`;
const pageTitle = (type: PageType, brief: Brief) =>
  type === "prices" && NICHES[brief.niche].menuName ? NICHES[brief.niche].menuName! : PAGE_TYPES.find((p) => p.id === type)!.label;

// Library photos that fit a niche, used until the client uploads their own (the shared
// library has few niche photos yet; other niches keep the template pictures).
const STOCK: Partial<Record<Brief["niche"], string[]>> = {
  cafe: ["/images/bakery-coffee.jpg", "/images/bakery-bread.jpg", "/images/bakery-pastries.jpg"],
  restaurant: ["/images/bakery-bread.jpg", "/images/bakery-coffee.jpg", "/images/bakery-pastries.jpg"],
};
// Writes all texts of one page (and of the header/footer for the home page) in one call.
async function writePage(record: Onboarding, brief: Brief, type: PageType, sections: Section[], layout?: Section[]) {
  const specs = [...sections, ...(layout ?? [])].map((s) => sectionSpec(s)).filter((s) => s !== null);
  const language = brief.languages[0];
  const result = await recordAi(record.id, `write page: ${type}`, {
    system: `You write the texts of a small-business website built from ready-made sections. ${WRITING_RULES(language, brief.tone)} For every section fill every field key given; for lists return one row per REAL item from the brief (menu items, services, team members, reviews…), at most the list's max. If the brief has no real items for a list, return an empty list [] — the website then hides it; never fill lists with placeholder or sample items. A block with several lists (e.g. menu categories) gets one brief category per list in order; unused lists are [] and their title/note fields (the list's "own" keys) "". The page's purpose: ${type}. Answer JSON: {"title": menu label of the page in the website language (1-2 words), "seo": {"title": up to 60 chars, "description": 70-160 chars}, "sections": {"<section id>": {"values": {"<field key>": "text"}, "lists": {"<list id>": [{"<field key>": "text"}]}}}}`,
    user: `Brief: ${briefForAi(brief)}\n\nSections of the page (field key: purpose and the current example text):\n${JSON.stringify(specs)}`,
    maxTokens: 4000,
    json: true,
    mock: () =>
      JSON.stringify({
        title: pageTitle(type, brief),
        seo: { title: `${brief.business} — ${pageTitle(type, brief)}`, description: brief.summary.slice(0, 150) },
        sections: Object.fromEntries(specs.map((spec, n) => [spec.id, mockWrite(spec, brief, n === 0 && type === "home")])),
      }),
  });
  const answer = parseJson<{ title?: unknown; seo?: { title?: unknown; description?: unknown }; sections?: Record<string, SectionAnswer> }>(result.text);
  return {
    title: typeof answer.title === "string" && answer.title.trim() ? answer.title.trim().slice(0, 60) : pageTitle(type, brief),
    seo: {
      title: typeof answer.seo?.title === "string" ? answer.seo.title.slice(0, 120) : `${brief.business} — ${pageTitle(type, brief)}`,
      description: typeof answer.seo?.description === "string" ? answer.seo.description.slice(0, 300) : "",
    },
    sections: sections.map((s) => applyAnswer(s, answer.sections?.[s.id], "write", { emptyMissing: true })),
    layout: layout?.map((s) => applyAnswer(s, answer.sections?.[s.id])),
  };
}

// Builds the draft website from the confirmed brief: style preset + font pair of the niche,
// pages from the niche plan, texts by AI, client photos placed in order. Pages stay drafts
// (nothing is published) and the website is hidden from search engines until launch.
export async function buildDraft(id: string, by: string) {
  const record = await readRecord(id);
  const brief = record.brief;
  if (!brief || !record.briefConfirmed) throw new StoreError("Confirm the brief first.");
  if (!["draft", "review"].includes(record.step)) throw new StoreError("The website is past the draft stage.", 409);
  if (record.review.some((item) => item.status === "approved"))
    throw new StoreError("Some blocks are already approved. Comment on blocks instead of rebuilding.", 409);
  const project = await readProject(record.siteId);
  const own = new Set(record.pages.map((p) => p.pageId));
  // A new website starts with the published sample pages, which are replaced. Pages
  // published after the onboarding started are real content: never overwritten.
  if (project.pages.some((p) => p.published && !own.has(p.id) && p.published.updatedAt > record.createdAt))
    throw new StoreError("This website already has published pages; onboarding builds new websites only.", 409);
  const niche = NICHES[brief.niche] ?? NICHES.services;
  const preset = presetById(niche.preset)!;
  const main = brief.languages[0];
  const types = brief.pages.filter((t, i, all) => all.indexOf(t) === i);
  const header = createSection(niche.header, "site-header");
  const footer = createSection(niche.footer, "site-footer");
  const pages: CmsPage[] = [];
  let layout: Section[] = [header, footer];
  let photo = 0;
  const now = new Date().toISOString();
  for (const type of types) {
    const blocks = pageBlocks(brief.niche, type);
    const sections = blocks.map(([variant, tone], n) => {
      const section = createSection(variant, `${type}-${n + 1}-${newId().slice(0, 6)}`);
      if (tone) section.tone = tone;
      return section;
    });
    const written = await writePage(record, brief, type, sections, type === "home" ? layout : undefined);
    if (written.layout) layout = written.layout;
    photo = placePhotos(written.sections, record.photos.length ? record.photos : (STOCK[brief.niche] ?? []), photo);
    const slug = PAGE_TYPES.find((p) => p.id === type)!.slug;
    pages.push({
      id: `ob-${type}`,
      title: type === "home" ? (HOME_TITLE[main] ?? written.title) : written.title,
      slug,
      locale: main,
      status: "Draft",
      sections: written.sections,
      seo: { title: written.seo.title, description: written.seo.description, keywords: "", image: "", noindex: false },
      updatedAt: now,
    });
  }
  const menu = (id: string, placement: "header" | "footer"): Menu => ({
    id,
    title: placement === "header" ? "Main" : "Explore",
    placement,
    items: pages.map((p) => ({ id: `${id}-${p.id}`, label: p.title, pageId: p.id, url: "", children: [] })),
  });
  const next: Project = {
    ...project,
    pages,
    menus: [menu("main", "header"), menu("footer-main", "footer")],
    layout: {
      ...project.layout,
      header: layout[0],
      footer: layout[1],
      headerMenus: ["main"],
      footerMenus: ["footer-main"],
      homePageId: "ob-home",
      localized: undefined,
    },
    brand: {
      ...project.brand,
      name: brief.business,
      primary: preset.colors.ink,
      secondary: preset.colors.bg,
      alternative: brief.accent || preset.colors.accent,
    },
    fonts: (FONT_PAIR_IDS as readonly string[]).includes(preset.fonts) ? preset.fonts : project.fonts,
    style: {
      preset: preset.id,
      surface: preset.colors.surface,
      muted: preset.colors.muted,
      radius: preset.radius,
      spacing: preset.spacing,
      buttons: preset.buttons,
    },
    website: {
      url: project.website?.url ?? "",
      timeZone: project.website?.timeZone || "Europe/Riga",
      contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brief.email) ? brief.email : (project.website?.contactEmail ?? ""),
      phone: brief.phone || project.website?.phone || "",
      address: brief.address || project.website?.address || "",
    },
    languages: { default: main, enabled: [main] },
    seo: { ...(project.seo ?? {}), hideSite: true },
  };
  await writeProject(next, undefined, "super-admin", { siteId: record.siteId });
  return changeRecord(id, (record) => {
    const old = new Map(record.review.map((item) => [`${item.pageId}:${item.sectionId}`, item]));
    record.plan = { niche: brief.niche, preset: preset.id, fonts: preset.fonts, pages: types, main };
    record.pages = pages.map((p) => ({ pageId: p.id, type: types[pages.indexOf(p)], locale: main, title: p.title, slug: p.slug }));
    record.review = pages.flatMap((page) =>
      page.sections.filter((section) => !section.hidden).map((section): ReviewItem => {
        const label = `${page.title} · ${section.variant.split("-v")[0]}`;
        return {
          id: old.get(`${page.id}:${section.id}`)?.id ?? newId(),
          pageId: page.id,
          sectionId: section.id,
          locale: main,
          label,
          status: "pending",
          version: 1,
          updatedAt: new Date().toISOString(),
          history: [{ at: new Date().toISOString(), by: "AI", kind: "created" }],
        };
      }),
    );
    record.translations = [];
    record.step = "review";
    record.messages.push({
      id: newId(),
      role: "assistant",
      text: `Your draft website is ready: ${pages.length} page${pages.length > 1 ? "s" : ""}. Look through it, click any block to comment (by text or voice), and approve the blocks you like.`,
      at: new Date().toISOString(),
    });
    logEvent(record, `Draft built: ${pages.map((p) => p.slug).join(", ")}`, by);
    return record;
  });
}
