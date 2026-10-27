import type { Definition, Section, CollectionItem, Repeater } from "./types";
export function collectionItems(
  section: Section,
  entry: Definition,
  group: Repeater,
): CollectionItem[] {
  return (
    section.collections?.[group.id] ??
    group.items.map((template, index) => ({
      id: `initial-${index}`,
      template: index,
      values: Object.fromEntries(
        template.fields.map((key) => [
          key,
          section.values[key] ??
            entry.fields.find((f) => f.key === key)?.value ??
            "",
        ]),
      ),
    }))
  );
}
export function newCollectionItem(
  entry: Definition,
  group: Repeater,
  template = 0,
): CollectionItem {
  return {
    id: crypto.randomUUID(),
    template,
    values: Object.fromEntries(
      group.items[template].fields.map((key) => [
        key,
        entry.fields.find((f) => f.key === key)?.value ?? "",
      ]),
    ),
  };
}
