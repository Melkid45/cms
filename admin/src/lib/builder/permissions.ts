import type { Project, Section } from "./types";
import { definition } from "./catalog";
import { collectionItems } from "./collections";

export type { Role, Identity } from "./access";
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, JSON.parse(canonical(v))]),
      ),
    );
  return JSON.stringify(value) ?? "null";
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function clientProjectError(
  next: Project,
  current: Project,
): string | undefined {
  const denied =
    "Your account can edit content and reorder existing sections. Design and structure are managed by the super admin.";
  if (
    !same(next.layout, current.layout) ||
    !same(next.menus, current.menus) ||
    !same(next.media, current.media)
  )
    return denied;
  const {
    logo: _logo,
    footerLogo: _footer,
    name: _name,
    ...brand
  } = next.brand;
  const {
    logo: _oldLogo,
    footerLogo: _oldFooter,
    name: _oldName,
    ...oldBrand
  } = current.brand;
  void _name;
  void _oldName;
  void _logo;
  void _footer;
  void _oldLogo;
  void _oldFooter;
  if (!same(brand, oldBrand) || next.pages.length !== current.pages.length)
    return denied;
  for (const page of next.pages) {
    const before = current.pages.find((p) => p.id === page.id);
    if (!before) return denied;
    const { sections, updatedAt: _time, status: _status, ...rest } = page;
    const {
      sections: oldSections,
      updatedAt: _oldTime,
      status: _oldStatus,
      ...oldRest
    } = before;
    void _time;
    void _status;
    void _oldTime;
    void _oldStatus;
    if (
      !same(rest, oldRest) ||
      new Set(sections.map((s) => s.id)).size !== sections.length ||
      sections.length !== oldSections.length
    )
      return denied;
    if (before.deletedAt && !same(page, before)) return denied;
    for (const section of sections) {
      const old = oldSections.find((s) => s.id === section.id);
      if (!old || !allowedSection(section, old)) return denied;
    }
  }
}
function allowedSection(next: Section, old: Section) {
  if (next.variant !== old.variant || next.hidden !== old.hidden) return false;
  const entry = definition(old.variant);
  const valid = new Set(entry?.fields.map((f) => f.key));
  const valuesAllowed = (
    a: Record<string, string>,
    b: Record<string, string>,
    keys = valid,
  ) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
      (key) => a[key] === b[key] || keys.has(key),
    );
  if (!valuesAllowed(next.values, old.values)) return false;
  if (
    Object.keys(old.collections || {}).some((key) => !next.collections?.[key])
  )
    return false;
  for (const [key, items] of Object.entries(next.collections || {})) {
    const group = entry?.repeaters?.find((g) => g.id === key);
    const previous =
      group && entry ? collectionItems(old, entry, group) : undefined;
    if (!previous || !group || items.length !== previous.length) return false;
    for (let i = 0; i < items.length; i++) {
      if (
        items[i].id !== previous[i].id ||
        items[i].template !== previous[i].template ||
        !valuesAllowed(
          items[i].values,
          previous[i].values,
          new Set(group.items[items[i].template]?.fields),
        )
      )
        return false;
    }
  }
  return true;
}
