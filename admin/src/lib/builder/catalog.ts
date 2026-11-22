import { variantForm } from "./form-defaults";
import data from "./catalog.json";
import type { Definition, Section } from "./types";
import { collectionItems } from "./collections";
export const definitions = data as Definition[];
export const definition = (id: string) =>
  definitions.find((item) => item.id === id);
export function createSection(
  variant: string,
  id = crypto.randomUUID(),
): Section {
  const entry = definition(variant);
  if (!entry) throw new Error("Unknown section");
  return {
    id,
    variant,
    ...(entry.family === "form"
      ? { form: variantForm(id, variant) }
      : {}),
    values: Object.fromEntries(
      entry.fields.map((field) => [field.key, field.value]),
    ),
  };
}
export { safeUrl } from "./safe-url";
export function switchSection(section: Section, variant: string): Section {
  const from = definition(section.variant),
    to = definition(variant);
  if (!from || !to || from.family !== to.family)
    throw new Error("Choose a variation from the same family.");
  const next = createSection(variant, section.id),
    counts: Record<string, number> = {};
  if (section.form)
    next.form = {
      ...section.form,
      layout: variant === "form-v2" ? "split" : "compact",
    };
  for (const field of to.fields) {
    const role = field.role || field.type,
      index = (counts[role] = (counts[role] || 0) + 1) - 1;
    const old = from.fields.filter((f) => (f.role || f.type) === role)[index];
    if (
      old &&
      section.values[old.key] !== undefined &&
      section.values[old.key] !== old.value
    )
      next.values[field.key] = section.values[old.key];
  }
  next.hidden = section.hidden;
  if (section.collections && to.repeaters?.length) {
    next.collections = {};
    for (const [index, group] of to.repeaters.entries()) {
      const source = from.repeaters?.[index];
      if (!source) continue;
      next.collections[group.id] = collectionItems(section, from, source).map(
        (item, n) => {
          const template = n % group.items.length;
          const counts: Record<string, number> = {};
          const previous = source.items[item.template].fields.map((key) =>
            from.fields.find((f) => f.key === key)!,
          );
          return {
            id: item.id,
            detail: item.detail,
            template,
            values: Object.fromEntries(
              group.items[template].fields.map((key) => {
                const field = to.fields.find((f) => f.key === key)!;
                const role = field.role || field.type;
                const offset = (counts[role] = (counts[role] || 0) + 1) - 1;
                const old = previous.filter((f) => (f.role || f.type) === role)[
                  offset
                ];
                return [
                  key,
                  old
                    ? (item.values[old.key] ??
                      section.values[old.key] ??
                      old.value)
                    : field.value,
                ];
              }),
            ),
          };
        },
      );
    }
  }
  return next;
}
