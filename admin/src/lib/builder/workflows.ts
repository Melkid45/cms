import type { CmsPage, PageSnapshot, Project, PageVersion } from "./types";
export function pageSnapshot(page: PageSnapshot): PageSnapshot {
  return {
    title: page.title,
    slug: page.slug,
    locale: page.locale,
    sections: structuredClone(page.sections),
    seo: structuredClone(page.seo),
    updatedAt: page.updatedAt,
  };
}
export function normalizeProject(project: Project): Project {
  return {
    ...project,
    forms: project.forms ?? {
      enabled: true,
      recipient: "",
      successMessage: "Thank you. Your message has been received.",
    },
    pages: project.pages.map((page) => ({
      ...page,
      history: page.history ?? [],
      published:
        page.published ??
        (page.status === "Published" ? pageSnapshot(page) : undefined),
    })),
  };
}
export function hasDraftChanges(page: CmsPage) {
  if (!page.published) return true;
  return !samePageContent(page, page.published);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  return value;
}
function samePageContent(a: PageSnapshot, b: PageSnapshot) {
  const { updatedAt: _a, ...left } = pageSnapshot(a),
    { updatedAt: _b, ...right } = pageSnapshot(b);
  void _a;
  void _b;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
export function preparePages(
  next: CmsPage[],
  previous: CmsPage[],
  publishId?: string,
): CmsPage[] {
  const now = new Date().toISOString();
  return next.map((page) => {
    const old = previous.find((p) => p.id === page.id);
    const publishing = page.id === publishId;
    const history = [...(old?.history ?? [])];
    const changed =
      old && (!samePageContent(page, old) || page.deletedAt !== old.deletedAt);
    if (old && (changed || publishing)) {
      const kind: PageVersion["kind"] =
        page.deletedAt && !old.deletedAt
          ? "Moved to trash"
          : !page.deletedAt && old.deletedAt
            ? "Restored"
            : publishing
              ? "Published"
              : "Draft saved";
      history.unshift({
        ...pageSnapshot(old),
        id: crypto.randomUUID(),
        updatedAt: now,
        kind,
      });
    }
    const published = publishing
      ? { ...pageSnapshot(page), updatedAt: now }
      : old?.published;
    return {
      ...page,
      status: published ? "Published" : "Draft",
      published,
      history: history.slice(0, 20),
      updatedAt: changed || publishing || !old ? now : old.updatedAt,
    };
  });
}
export function publicProject(project: Project): Project {
  return {
    ...project,
    pages: project.pages
      .filter((p) => !p.deletedAt && p.published)
      .map((p) => ({
        id: p.id,
        ...p.published!,
        status: "Published" as const,
      })),
    forms: project.forms ? { ...project.forms, recipient: "" } : undefined,
  };
}
