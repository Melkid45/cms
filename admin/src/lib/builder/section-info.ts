import { definition } from "./catalog";
import type {
  Section,
  Field,
  Definition,
  Repeater,
  SectionAccess,
} from "./types";
export const defaultSectionAccess: SectionAccess = {
  text: true,
  images: true,
  reorder: true,
  lockedFields: [] as string[],
};
export function fieldEditable(section: Section, field: Field) {
  const access = section.clientAccess || defaultSectionAccess;
  return (
    !access.lockedFields.includes(field.key) &&
    (field.type === "image" || field.label === "Image description"
      ? access.images
      : access.text)
  );
}
export function collectionEditable(
  section: Section,
  entry: Definition,
  group: Repeater,
) {
  return (
    !!section.clientAccess?.collections?.includes(group.id) &&
    group.items.every((item) =>
      item.fields.every((key) => {
        const field = entry.fields.find((f) => f.key === key);
        return !!field && fieldEditable(section, field);
      }),
    )
  );
}
export function sectionInfo(section: Section) {
  const entry = definition(section.variant);
  const title =
    entry?.fields.find((f) => f.role === "Main heading") ||
    entry?.fields.find((f) => f.type === "heading");
  const image = entry?.fields.find((f) => f.type === "image");
  return {
    title:
      (title
        ? (section.values[title.key] ?? title.value)
        : entry?.title || "Section"
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100) ||
      entry?.title ||
      "Section",
    family: entry?.title || "Section",
    image: image
      ? (section.values[image.key] ?? image.value)
      : entry?.thumbnail,
    thumbnail: entry?.thumbnail,
  };
}
