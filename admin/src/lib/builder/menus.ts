import type { Project } from "./types";

// Older projects shared one menu between header and footer. Preserve its content,
// but give each placement its own group so editing one cannot affect the other.
export function separateLayoutMenus(project: Project): Project {
  const headerIds = new Set(project.layout.headerMenus);
  const footerIds = new Set(project.layout.footerMenus);
  const menus = project.menus.map((menu) => ({
    ...menu,
    placement: headerIds.has(menu.id)
      ? ("header" as const)
      : footerIds.has(menu.id)
        ? ("footer" as const)
        : menu.placement || ("header" as const),
  }));
  const used = new Set(menus.map((menu) => menu.id));
  const footerMenus = project.layout.footerMenus.map((id) => {
    if (!headerIds.has(id)) return id;
    const original = menus.find((menu) => menu.id === id);
    if (!original) return id;
    const base = id.slice(0, 80);
    let copyId = `${base}-footer`,
      index = 2;
    while (used.has(copyId)) copyId = `${base}-footer-${index++}`;
    used.add(copyId);
    menus.push({
      ...structuredClone(original),
      id: copyId,
      placement: "footer",
    });
    return copyId;
  });
  return { ...project, menus, layout: { ...project.layout, footerMenus } };
}
