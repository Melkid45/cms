import {keepCatalogInfo} from "./products/apply";
import type { Project, Section, CmsService } from "./types";
import { definition } from "./catalog";
import { collectionItems } from "./collections";
export function connectedContent(
  source: Project,
  extra: Section[] = [],
  published = false,
) {
  const forms = new Map((source.formDefinitions || []).map((f) => [f.id, f]));
  const services = new Map((source.services || []).map((s) => [s.id, s]));
  // Collect forms first so services can refer to a form block later on the page.
  const sourceSections = [
    ...source.pages
      .filter((p) => !p.deletedAt)
      .flatMap((p) => (published ? p.published?.sections || [] : p.sections)),
    ...extra,
    source.layout.header,
    source.layout.footer,
  ];
  for (const section of sourceSections)
    if (section.form && !section.hidden)
      forms.set(section.form.id, section.form);
  const bind = (section: Section): Section => {
    const entry = definition(section.variant);
    const result = { ...section, formId: section.form?.id || section.formId };
    if (entry?.family !== "services" || section.hidden) return result;
    const collections = { ...section.collections };
    for (const group of entry.repeaters || [])
      collections[group.id] = collectionItems(section, entry, group).map(
        (item) => {
          // Items without service settings keep their own links (services blocks of existing
          // websites link to real pages); only items whose details were set up in the section
          // editor get the service action (or lose the link with mode "none").
          if (!item.detail) return item;
          const detail = item.detail;
          const fields = entry.fields.filter((f) =>
            group.items[item.template]?.fields.includes(f.key),
          );
          const value = (key: string) =>
            item.values[key] ??
            section.values[key] ??
            entry.fields.find((f) => f.key === key)?.value ??
            "";
          const title =
            fields.find((f) => f.role === "Item heading") ||
            fields.find((f) => f.type === "heading") ||
            fields.find((f) => f.type === "textarea") ||
            fields.find((f) => f.type === "text");
          const summary = fields.find(
            (f) => f.type === "textarea" && f.key !== title?.key,
          );
          const image = fields.find((f) => f.type === "image");
          const id = `block-${section.id}-${item.id}`;
          const service: CmsService = {
            id,
            title: title ? value(title.key) : "Service",
            slug: id.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase(),
            summary: summary ? value(summary.key) : "",
            body: detail.body,
            image: image ? value(image.key) : "",
            imageAlt: "",
            mode: detail.mode === "none" ? "modal" : detail.mode,
            status: "Published",
            formId: detail.formId,
          };
          if (detail.mode !== "none") services.set(id, service);
          const actions = { ...item.actions };
          for (const field of fields.filter((f) => f.type === "url"))
            actions[field.key] =
              detail.mode === "none"
                ? { type: "none", target: "none" }
                : { type: "service", target: id };
          return { ...item, actions };
        },
      );
    return { ...result, collections };
  };
  const pages = source.pages.map((page) => {
    const sections = (
      published ? page.published?.sections || [] : page.sections
    ).map(bind);
    return {
      ...page,
      sections,
      ...(published && page.published
        ? { published: { ...page.published, sections } }
        : {}),
    };
  });
  const sections = extra.map(bind);
  const layout = {
    ...source.layout,
    header: bind(source.layout.header),
    footer: bind(source.layout.footer),
  };
  return {
    project: keepCatalogInfo(source,{
      ...source,
      pages,
      layout,
      formDefinitions: [...forms.values()],
      services: [...services.values()],
    }),
    sections,
  };
}
