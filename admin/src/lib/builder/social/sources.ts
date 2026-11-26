import "server-only";
import { definition } from "../catalog";
import { pageHref, translationsOf } from "../i18n";
import type { CmsPage, Project, Section } from "../types";
import type { PostFields, SourceOption } from "./shared";

// "Create post from…": every active page and every repeated card with an image
// (products, works). Content comes from the published snapshot when there is one.

const PRICE = /(^|\s)(€\s?\d[\d\s.,]*|\d[\d\s.,]*\s?(€|eur\b|euro))/i;
const isPrice = (value: string) => PRICE.test(value.trim()) && value.length < 40;
const clean = (value: string) =>
  value
    .replace(/\*\*|###\s?|^- /gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

type FieldInfo = { key: string; type: string };
function fieldsOf(section: Section) {
  const def = definition(section.variant);
  const types = new Map<string, string>(
    (def?.fields ?? []).map((f) => [f.key, f.type]),
  );
  return { def, types };
}

// Reads title / description / price / images / first internal link from a value map.
function extract(values: Record<string, string>, fields: FieldInfo[]) {
  let title = "",
    description = "",
    price = "",
    link = "";
  const images: string[] = [];
  for (const { key, type } of fields) {
    const value = (values[key] ?? "").trim();
    if (!value) continue;
    if (type === "image") images.push(value);
    else if (type === "url") {
      if (!link && value.startsWith("/site/")) link = value;
    } else if (isPrice(value) && /\d/.test(value)) {
      if (!price) price = value;
    } else if (type === "heading") {
      if (!title) title = clean(value);
    } else if (type === "textarea") {
      if (!description || value.length > description.length)
        description = clean(value);
    }
  }
  return { title, description, price, link, images };
}

const SKIP_IMAGE = /\.svg($|\?)|\/icons?\//i;

function pageContent(page: Pick<CmsPage, "sections" | "seo" | "title">) {
  const images: string[] = [];
  let price = "",
    description = "",
    title = "";
  for (const section of page.sections.filter((s) => !s.hidden)) {
    const { def, types } = fieldsOf(section);
    if (!def) continue;
    const found = extract(
      section.values,
      def.fields.map((f) => ({ key: f.key, type: types.get(f.key) || f.type })),
    );
    images.push(...found.images);
    if (!price && found.price) price = found.price;
    if (!title && found.title) title = found.title;
    if (!description && found.description) description = found.description;
  }
  return {
    title: page.title || title,
    description: clean(page.seo?.description || "") || description,
    price,
    images: [
      ...new Set(
        [page.seo?.image, ...images].filter(
          (url): url is string => !!url && !SKIP_IMAGE.test(url),
        ),
      ),
    ],
  };
}

function itemsOf(section: Section) {
  const { def, types } = fieldsOf(section);
  if (!def?.repeaters) return [];
  return def.repeaters.flatMap((group) =>
    (section.collections?.[group.id] ?? []).map((item, index) => {
      const fields = (group.items[item.template]?.fields ?? []).map((key) => ({
        key,
        type: types.get(key) || "text",
      }));
      return { group: group.id, index, item, found: extract(item.values, fields) };
    }),
  );
}

const view = (page: CmsPage) =>
  page.published && page.status === "Published"
    ? { ...page, ...page.published }
    : page;

export function sourceOptions(
  project: Project,
  siteKey: string,
  baseUrl: string,
): SourceOption[] {
  const pages = project.pages.filter((p) => !p.deletedAt);
  const absolute = (path: string) =>
    path.startsWith("http") ? path : baseUrl.replace(/\/$/, "") + path;
  const linkOf = (page: CmsPage) =>
    absolute(pageHref(project, siteKey, page));
  // Internal /site/{key}/{slug} links → the target page's real public URL.
  const targetOf = (link: string) => {
    const slug = link.split("?")[0].split("#")[0].split("/").filter(Boolean).pop();
    return pages.find((p) => p.slug === slug);
  };
  const resolveLink = (link: string, fallback: CmsPage) =>
    linkOf(targetOf(link) ?? fallback);
  // A card links to its product/work page: that page fills an empty or clipped
  // description and offers its images too.
  const details = new Map<string, ReturnType<typeof pageContent>>();
  const detail = (link: string) => {
    const target = link ? targetOf(link) : undefined;
    if (!target) return undefined;
    if (!details.has(target.id)) details.set(target.id, pageContent(view(target)));
    return details.get(target.id);
  };
  const better = (own: string, page?: string) =>
    page && (!own || /(\.\.\.|…)$/.test(own)) ? page : own;
  const options: SourceOption[] = [];
  for (const raw of pages) {
    const page = view(raw);
    const siblings = translationsOf(pages, raw).filter((p) => p.id !== raw.id);
    // Cards first: products / works with an image.
    page.sections.forEach((section, sectionIndex) => {
      if (section.hidden) return;
      for (const { group, index, item, found } of itemsOf(section)) {
        const image = found.images.find((url) => !SKIP_IMAGE.test(url));
        if (!image || !found.title) continue;
        const linked = detail(found.link);
        const fields: PostFields = {
          title: found.title,
          description: better(found.description, linked?.description),
          price: found.price,
          link: found.link ? resolveLink(found.link, raw) : linkOf(raw),
        };
        const translations: Record<string, PostFields> = {};
        for (const sibling of siblings) {
          const other = view(sibling).sections[sectionIndex];
          if (other?.variant !== section.variant) continue;
          const match = itemsOf(other).find(
            (entry) => entry.group === group && entry.index === index,
          )?.found;
          if (match?.title)
            translations[sibling.locale] = {
              title: match.title,
              description: better(match.description, detail(match.link)?.description),
              price: match.price || fields.price,
              link: match.link ? resolveLink(match.link, sibling) : linkOf(sibling),
            };
        }
        options.push({
          key: `item:${raw.id}:${section.id}:${item.id}`,
          source: {
            kind: "item",
            pageId: raw.id,
            sectionId: section.id,
            itemId: item.id,
            label: `${page.title} → ${found.title}`,
            type: found.price ? "product" : "work",
          },
          locale: raw.locale,
          image,
          images: [
            ...new Set([...found.images, ...(linked?.images ?? [])]),
          ]
            .filter((url) => !SKIP_IMAGE.test(url))
            .slice(0, 12),
          fields,
          translations,
        });
      }
    });
    const content = pageContent(page);
    if (!content.images.length) continue;
    const translations: Record<string, PostFields> = {};
    for (const sibling of siblings) {
      const other = pageContent(view(sibling));
      translations[sibling.locale] = {
        title: other.title,
        description: other.description,
        price: other.price || content.price,
        link: linkOf(sibling),
      };
    }
    options.push({
      key: `page:${raw.id}`,
      source: {
        kind: "page",
        pageId: raw.id,
        label: page.title,
        type: content.price ? "product" : "work",
      },
      locale: raw.locale,
      image: content.images[0],
      images: content.images.slice(0, 12),
      fields: {
        title: content.title,
        description: content.description,
        price: content.price,
        link: linkOf(raw),
      },
      translations,
    });
  }
  // The same card often appears on several pages (catalogue + home): keep the first.
  const seen = new Set<string>();
  return options.filter((option) => {
    if (option.source.kind !== "item") return true;
    const id = `${option.locale}|${option.fields.title}|${option.image}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
