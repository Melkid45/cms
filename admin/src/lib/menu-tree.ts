export interface MenuItem { slug: string; label: string; parentSlug?: string }

// Keep a two-level menu in display order, with children directly after their parent.
export function normalizeMenu(items: MenuItem[]): MenuItem[] {
  const roots = new Set(items.filter((item) => !item.parentSlug).map((item) => item.slug));
  const valid = items.map((item) => item.parentSlug && !roots.has(item.parentSlug) ? { ...item, parentSlug: undefined } : item);
  return valid.filter((item) => !item.parentSlug).flatMap((root) => [root, ...valid.filter((item) => item.parentSlug === root.slug)]);
}

export function menuSiblings(items: MenuItem[], item: MenuItem) {
  return items.filter((entry) => entry.parentSlug === item.parentSlug);
}

export function moveMenuItem(items: MenuItem[], slug: string, direction: number): MenuItem[] {
  const item = items.find((entry) => entry.slug === slug);
  if (!item) return items;
  const siblings = menuSiblings(items, item);
  const neighbor = siblings[siblings.findIndex((entry) => entry.slug === slug) + direction];
  if (!neighbor) return items;
  const group = (entry: MenuItem) => [entry, ...items.filter((child) => child.parentSlug === entry.slug)];
  const moving = group(item);
  const remaining = items.filter((entry) => !moving.includes(entry));
  const neighborGroup = group(neighbor);
  const position = direction < 0 ? remaining.indexOf(neighbor) : remaining.indexOf(neighborGroup[neighborGroup.length - 1]) + 1;
  remaining.splice(position, 0, ...moving);
  return remaining;
}
