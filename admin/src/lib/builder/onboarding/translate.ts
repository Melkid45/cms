import "server-only";
import { readProject, StoreError, writeProject } from "../server";
import { definition } from "../catalog";
import type { CmsPage, Menu, Section } from "../types";
import type { ReviewItem } from "./shared";
import { applyAnswer, mockTranslate, sectionTexts, type SectionAnswer } from "./content";
import { HOME_TITLE, LANGUAGE_NAMES } from "./generate";
import { changeRecord, logEvent, newId, parseJson, readRecord, recordAi } from "./store";

const TRANSLATE_RULES = (from: string, to: string, business: string) =>
  `The business is called "${business}": a name, never translate it. Translate website texts from ${LANGUAGE_NAMES[from] || from} into ${LANGUAGE_NAMES[to] || to} for a small-business website. Natural, idiomatic, same meaning and similar length; keep names, prices, phone numbers, e-mails, addresses and placeholders in square brackets ("[price]") unchanged (translate the words inside brackets only). Keep "\\n" line breaks. Return the same JSON shape with the same keys, only the text values translated.`;

// Translates the approved main-language pages (plus header/footer texts) into the chosen
// languages: one AI call per page and language. Each translated page joins the original's
// translation group, gets its own menus (language-filtered) and review items.
export async function translateSite(id: string, locales: string[], by: string) {
  const record = await readRecord(id);
  if (record.step !== "translation") throw new StoreError("Approve every block first.", 409);
  const main = record.plan!.main;
  const wanted = [...new Set(locales)].filter((l) => l !== main && LANGUAGE_NAMES[l]);
  if (!wanted.length) throw new StoreError("Choose at least one other language.");
  let project = await readProject(record.siteId);
  const mainPages = record.pages.filter((p) => p.locale === main);
  for (const locale of wanted) {
    if (record.pages.some((p) => p.locale === locale)) continue;
    const created: CmsPage[] = [];
    let layoutTexts: { header?: Record<string, string>; footer?: Record<string, string> } | undefined;
    for (const ref of mainPages) {
      const page = project.pages.find((p) => p.id === ref.pageId);
      if (!page) continue;
      const withLayout = ref.type === "home";
      const sections = withLayout ? [...page.sections, project.layout.header, project.layout.footer] : page.sections;
      const texts = {
        title: page.title,
        seo: { title: page.seo.title, description: page.seo.description },
        sections: Object.fromEntries(sections.map((s) => [s.id, sectionTexts(s)])),
      };
      const result = await recordAi(id, `translate ${ref.slug} → ${locale}`, {
        system: TRANSLATE_RULES(main, locale, record.brief?.business || record.business),
        user: JSON.stringify(texts),
        maxTokens: 4000,
        json: true,
        mock: () =>
          JSON.stringify({
            title: `[${locale}] ${texts.title}`,
            seo: { title: `[${locale}] ${texts.seo.title}`, description: texts.seo.description },
            sections: Object.fromEntries(Object.entries(texts.sections).map(([k, v]) => [k, mockTranslate(v, locale)])),
          }),
      });
      const answer = parseJson<{ title?: unknown; seo?: { title?: unknown; description?: unknown }; sections?: Record<string, SectionAnswer> }>(result.text);
      const copy = (section: Section): Section => {
        const translated = applyAnswer(section, answer.sections?.[section.id], "translate");
        const collections = translated.collections
          ? Object.fromEntries(
              Object.entries(translated.collections).map(([gid, items]) => [gid, items.map((item) => ({ ...item, id: newId() }))]),
            )
          : undefined;
        return { ...translated, id: `${section.id}-${locale}`, collections };
      };
      const group = page.translationGroup ?? `tg-${page.id}`;
      page.translationGroup = group;
      created.push({
        id: `${page.id}-${locale}`,
        title:
          ref.type === "home" && HOME_TITLE[locale]
            ? HOME_TITLE[locale]
            : typeof answer.title === "string" && answer.title.trim()
              ? answer.title.trim().slice(0, 60)
              : page.title,
        slug: `${page.slug}-${locale}`,
        locale,
        translationGroup: group,
        status: "Draft",
        sections: page.sections.map(copy),
        seo: {
          ...page.seo,
          title: typeof answer.seo?.title === "string" ? answer.seo.title.slice(0, 120) : page.seo.title,
          description: typeof answer.seo?.description === "string" ? answer.seo.description.slice(0, 300) : page.seo.description,
        },
        updatedAt: new Date().toISOString(),
      });
      if (withLayout) {
        const pick = (section: Section) => {
          const t = applyAnswer(section, answer.sections?.[section.id], "translate");
          const entry = definition(section.variant)!;
          // Only values that differ are stored (layout.localized merges over the defaults).
          return Object.fromEntries(
            entry.fields
              .filter((f) => t.values[f.key] !== undefined && t.values[f.key] !== (section.values[f.key] ?? f.value))
              .map((f) => [f.key, t.values[f.key]]),
          );
        };
        layoutTexts = { header: pick(project.layout.header), footer: pick(project.layout.footer) };
      }
    }
    // Menus: the existing ones belong to the main language; each language gets copies.
    const menus: Menu[] = project.menus
      .filter((m) => !m.locale || m.locale === main)
      .map((m) => ({
        ...m,
        id: `${m.id}-${locale}`,
        locale,
        items: m.items.map((item) => {
          const target = created.find((p) => p.id === `${item.pageId}-${locale}`);
          return { ...item, id: `${item.id}-${locale}`, pageId: target ? target.id : item.pageId, label: target?.title ?? item.label, children: [] };
        }),
      }));
    project = {
      ...project,
      pages: [...project.pages, ...created],
      menus: [
        ...project.menus.map((m) => (!m.locale ? { ...m, locale: main } : m)),
        ...menus.filter((m) => !project.menus.some((x) => x.id === m.id)),
      ],
      layout: {
        ...project.layout,
        headerMenus: [...new Set([...project.layout.headerMenus, ...menus.filter((m) => m.placement === "header").map((m) => m.id)])].slice(0, 6),
        footerMenus: [...new Set([...project.layout.footerMenus, ...menus.filter((m) => m.placement === "footer").map((m) => m.id)])].slice(0, 6),
        localized: { ...(project.layout.localized ?? {}), ...(layoutTexts ? { [locale]: layoutTexts } : {}) },
      },
      languages: {
        default: main,
        enabled: [...new Set([...(project.languages?.enabled ?? [main]), locale])],
      },
    };
    project = await writeProject(project, undefined, "super-admin", { siteId: record.siteId });
    await changeRecord(id, (record) => {
      for (const page of created) {
        const ref = record.pages.find((p) => p.pageId === page.id.slice(0, -(locale.length + 1)));
        record.pages.push({ pageId: page.id, type: ref?.type ?? "home", locale, title: page.title, slug: page.slug });
        for (const section of page.sections.filter((s) => !s.hidden))
          record.review.push({
            id: newId(),
            pageId: page.id,
            sectionId: section.id,
            locale,
            label: `${page.title} (${locale.toUpperCase()}) · ${section.variant.split("-v")[0]}`,
            status: "pending",
            version: 1,
            updatedAt: new Date().toISOString(),
            history: [{ at: new Date().toISOString(), by: "AI", kind: "created" }],
          } satisfies ReviewItem);
      }
      if (!record.translations.includes(locale)) record.translations.push(locale);
      logEvent(record, `Translated into ${locale}`, by);
    });
  }
  return changeRecord(id, (record) => {
    record.messages.push({
      id: newId(),
      role: "assistant",
      text: `Translations are ready (${wanted.map((l) => l.toUpperCase()).join(", ")}). Check them the same way: comment on a block or approve it.`,
      at: new Date().toISOString(),
    });
    return record;
  });
}

// Publishes every page of the onboarding (all languages) once every block is approved.
// Test records keep the website hidden from search engines.
export async function publishSite(id: string, by: string) {
  const record = await readRecord(id);
  if (record.step !== "translation") throw new StoreError("Approve every block first.", 409);
  if (record.review.some((i) => i.status !== "approved")) throw new StoreError("Some blocks are not approved yet.", 409);
  let first = true;
  for (const page of record.pages) {
    const project = await readProject(record.siteId);
    if (!project.pages.some((p) => p.id === page.pageId && !p.deletedAt)) continue;
    if (first) project.seo = { ...(project.seo ?? {}), hideSite: record.test };
    first = false;
    await writeProject(project, page.pageId, "super-admin", { siteId: record.siteId });
  }
  return changeRecord(id, (record) => {
    record.step = "live";
    record.publishedAt = new Date().toISOString();
    record.messages.push({ id: newId(), role: "assistant", text: "Your website is live. Congratulations!", at: record.publishedAt });
    logEvent(record, "Website published", by);
    return record;
  });
}
