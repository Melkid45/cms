import type { CmsPage, PageSnapshot, Project, PageVersion } from "./types";
export function pageSnapshot(page: CmsPage): PageSnapshot {
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
  const { updatedAt: _a, ...draft } = pageSnapshot(page),
    { updatedAt: _b, ...live } = page.published;
  void _a;
  void _b;
  return JSON.stringify(draft) !== JSON.stringify(live);
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
      old &&
      (JSON.stringify({ ...pageSnapshot(page), updatedAt: "" }) !==
        JSON.stringify({ ...pageSnapshot(old), updatedAt: "" }) ||
        page.deletedAt !== old.deletedAt);
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
