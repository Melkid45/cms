import "server-only";
import { definition } from "../catalog";
import { collectionItems } from "../collections";
import type { CollectionItem, Definition, Field, Section, TemplateNode } from "../types";
import type { Brief } from "./shared";
import { newId } from "./store";

// Generic bridge between library sections and AI: describes the editable texts of any
// variant (fields + repeatable lists) and applies an AI answer back onto the section.
// Images, links and videos are never written by AI.
const TEXT_TYPES = new Set(["heading", "textarea", "text"]);
const isText = (field: Field | undefined, mode: "write" | "translate") =>
  !!field &&
  TEXT_TYPES.has(field.type) &&
  (mode === "translate" || (field.role !== "Image description" && field.role !== "Placeholder"));
const repeaterKeys = (entry: Definition) =>
  new Set((entry.repeaters ?? []).flatMap((g) => g.items.flatMap((i) => i.fields)));
const describe = (field: Field, example: string) =>
  `${field.role || field.label}${example ? ` (now: ${JSON.stringify(example.slice(0, 160))})` : ""}`;

export interface SectionSpec {
  id: string;
  block: string;
  fields: Record<string, string>;
  // own = the list's title/note fields (blocks with several lists, e.g. menu categories).
  lists?: Record<string, { label: string; max: number; item: Record<string, string>; now: number; own?: string[] }>;
}
// mode "write": what AI should write (with current/example values); "translate": every text.
export function sectionSpec(section: Section, mode: "write" | "translate" = "write"): SectionSpec | null {
  const entry = definition(section.variant);
  if (!entry) return null;
  const inLists = repeaterKeys(entry);
  const fields: Record<string, string> = {};
  for (const field of entry.fields)
    if (!inLists.has(field.key) && isText(field, mode))
      fields[field.key] = describe(field, section.values[field.key] ?? field.value);
  const lists: NonNullable<SectionSpec["lists"]> = {};
  for (const group of entry.repeaters ?? []) {
    const keys = group.items[0].fields.filter((key) => isText(entry.fields.find((f) => f.key === key), mode));
    if (!keys.length) continue;
    const first = collectionItems(section, entry, group)[0];
    const own = (entry.repeaters ?? []).length > 1 ? groupOwnFields(entry, group.id).filter((k) => k in fields) : [];
    lists[group.id] = {
      ...(own.length ? { own } : {}),
      label: group.label,
      max: group.max ?? 30,
      now: collectionItems(section, entry, group).length,
      item: Object.fromEntries(
        keys.map((key) => [key, describe(entry.fields.find((f) => f.key === key)!, first?.template === 0 ? (first.values[key] ?? "") : "")]),
      ),
    };
  }
  return {
    id: section.id,
    block: `${entry.family} — ${entry.label}`,
    fields,
    ...(Object.keys(lists).length ? { lists } : {}),
  };
}
// Current texts of a section in the shape the AI answers with (for revisions and translation).
export function sectionTexts(section: Section, mode: "write" | "translate" = "translate") {
  const entry = definition(section.variant)!;
  const inLists = repeaterKeys(entry);
  const values: Record<string, string> = {};
  for (const field of entry.fields)
    if (!inLists.has(field.key) && isText(field, mode)) values[field.key] = section.values[field.key] ?? field.value;
  const lists: Record<string, Record<string, string>[]> = {};
  for (const group of entry.repeaters ?? []) {
    const items = collectionItems(section, entry, group);
    lists[group.id] = items.map((item) => {
      const keys = group.items[item.template]?.fields ?? [];
      const base = group.items[0].fields;
      // Rows always use the keys of the first card template, so AI sees one shape.
      return Object.fromEntries(
        base
          .map((key, i) => [key, keys[i]] as const)
          .filter(([key]) => isText(entry.fields.find((f) => f.key === key), mode))
          .map(([key, own]) => [key, item.values[own] ?? ""]),
      );
    });
  }
  return { values, lists };
}
export type SectionAnswer = { values?: Record<string, unknown>; lists?: Record<string, unknown> };
const clean = (value: unknown, max = 2000) =>
  typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : undefined;
// Fields that belong to one list's own block in the template (e.g. a menu category's title
// and note around its dishes): the fields of the largest container holding only this list.
function nodeFields(node: TemplateNode): string[] {
  return [
    ...(node.field ? [node.field] : []),
    ...Object.values(node.bindings ?? {}),
    ...(node.children ?? []).flatMap(nodeFields),
  ];
}
const nodeRepeats = (node: TemplateNode): string[] => [
  ...(node.repeat ? [node.repeat] : []),
  ...(node.children ?? []).flatMap(nodeRepeats),
];
export function groupOwnFields(entry: Definition, groupId: string): string[] {
  const find = (nodes: TemplateNode[], trail: TemplateNode[]): TemplateNode[] | null => {
    for (const node of nodes) {
      if (node.repeat === groupId) return [...trail, node];
      const found = find(node.children ?? [], [...trail, node]);
      if (found) return found;
    }
    return null;
  };
  const trail = find(entry.nodes, []);
  if (!trail) return [];
  let container: TemplateNode | undefined;
  for (let i = trail.length - 2; i >= 0; i--) {
    if (nodeRepeats(trail[i]).length > 1) break;
    container = trail[i];
  }
  const inLists = repeaterKeys(entry);
  return container ? [...new Set(nodeFields(container))].filter((key) => !inLists.has(key)) : [];
}
// Writes an AI answer onto a section: only known text keys, list rows mapped onto the
// card templates by position (cards alternate templates like the editor's Add button).
// An empty list ([]) empties that list: the server keeps at least one card per list, so it
// becomes one card without texts, and in a block with several lists (menu categories) the
// list's own title/note are cleared too, so the template hides the group (pricing-v50:
// a category without a title is hidden). A block whose lists are all empty is hidden (no
// filler on a client website). emptyMissing (new drafts): a list the answer leaves out is
// emptied instead of keeping the template's sample items.
export function applyAnswer(
  section: Section,
  answer: SectionAnswer | undefined,
  mode: "write" | "translate" = "write",
  options: { emptyMissing?: boolean } = {},
): Section {
  const entry = definition(section.variant);
  if (!entry) return section;
  if (!answer || typeof answer !== "object") answer = {};
  const inLists = repeaterKeys(entry);
  const next: Section = { ...section, values: { ...section.values } };
  for (const [key, value] of Object.entries(answer.values ?? {})) {
    const field = entry.fields.find((f) => f.key === key);
    const text = clean(value);
    if (text !== undefined && !inLists.has(key) && isText(field, mode)) next.values[key] = text;
  }
  for (const group of entry.repeaters ?? []) {
    const raw = (answer.lists as Record<string, unknown> | undefined)?.[group.id];
    const rows = Array.isArray(raw) ? raw : options.emptyMissing ? [] : null;
    if (!rows) continue;
    if (!rows.length) {
      next.collections = { ...(next.collections ?? {}), [group.id]: [blankItem(entry, group.items[0].fields)] };
      if ((entry.repeaters ?? []).length > 1) for (const key of groupOwnFields(entry, group.id)) next.values[key] = "";
      continue;
    }
    const current = collectionItems(section, entry, group);
    const limit = Math.min(group.max ?? 30, 30);
    const base = group.items[0].fields;
    const items: CollectionItem[] = rows.slice(0, limit).map((row, n) => {
      const old = current[n];
      const template = old?.template ?? n % group.items.length;
      const keys = group.items[template].fields;
      const values: Record<string, string> = {};
      keys.forEach((key, i) => {
        const field = entry.fields.find((f) => f.key === key)!;
        const fromRow = row && typeof row === "object" ? clean((row as Record<string, unknown>)[base[i]]) : undefined;
        const text = isText(entry.fields.find((f) => f.key === base[i]), mode);
        // New drafts: a text the answer leaves out is empty, never the template's sample text.
        values[key] =
          fromRow !== undefined && text
            ? fromRow
            : text && options.emptyMissing
              ? ""
              : (old?.values[key] ?? field.value);
      });
      return { id: old?.id && !old.id.startsWith("initial-") ? old.id : newId(), template, values };
    });
    // New drafts: rows without any text (the answer gave nothing for them) are dropped.
    const kept = options.emptyMissing
      ? items.filter((item) =>
          Object.entries(item.values).some(([key, value]) => isText(entry.fields.find((f) => f.key === key), mode) && value.trim()),
        )
      : items;
    next.collections = { ...(next.collections ?? {}), [group.id]: kept.length ? kept : [blankItem(entry, group.items[0].fields)] };
    if (!kept.length && (entry.repeaters ?? []).length > 1)
      for (const key of groupOwnFields(entry, group.id)) next.values[key] = "";
  }
  if (entry.repeaters?.length && entry.repeaters.every((g) => listIsEmpty(entry, next.collections?.[g.id]))) next.hidden = true;
  return next;
}
// One card with every text empty (images/links keep the template values): an "empty" list.
function blankItem(entry: Definition, keys: string[]): CollectionItem {
  return {
    id: newId(),
    template: 0,
    values: Object.fromEntries(
      keys.map((key) => {
        const field = entry.fields.find((f) => f.key === key)!;
        return [key, TEXT_TYPES.has(field.type) ? "" : field.value];
      }),
    ),
  };
}
const listIsEmpty = (entry: Definition, items: CollectionItem[] | undefined) =>
  !!items &&
  items.every((item) =>
    Object.entries(item.values).every(([key, value]) => !TEXT_TYPES.has(entry.fields.find((f) => f.key === key)?.type ?? "") || !value.trim()),
  );
// Puts the client's photos into the image fields of the generated pages, in page order.
export function placePhotos(sections: Section[], photos: string[], start = 0) {
  if (!photos.length) return start;
  let n = start;
  for (const section of sections) {
    const entry = definition(section.variant);
    // Portraits (team, reviews) keep their pictures: a room photo is not a person.
    if (!entry || entry.family === "team" || entry.family === "testimonials") continue;
    const inLists = repeaterKeys(entry);
    for (const field of entry.fields)
      if (field.type === "image" && !inLists.has(field.key)) section.values[field.key] = photos[n++ % photos.length];
    for (const group of entry.repeaters ?? [])
      for (const item of section.collections?.[group.id] ?? [])
        for (const key of group.items[item.template].fields)
          if (entry.fields.find((f) => f.key === key)?.type === "image") item.values[key] = photos[n++ % photos.length];
  }
  return n;
}

// ---- Mock answers (test records: no AI, deterministic) ----
export function mockWrite(spec: SectionSpec, brief: Brief, first: boolean) {
  const values: Record<string, string> = {};
  for (const [key, text] of Object.entries(spec.fields)) {
    if (text.startsWith("Main heading")) values[key] = first ? brief.business : `${spec.block.split(" — ")[0]} at ${brief.business}`;
    else if (text.startsWith("Description")) values[key] = brief.summary.slice(0, 300) || "[Description]";
  }
  // One brief category per list (menu categories); a single list takes every offer; lists
  // without offers stay empty (hidden), like the real answers.
  const lists: Record<string, Record<string, string>[]> = {};
  const ids = Object.keys(spec.lists ?? {});
  const categories = [...new Set(brief.offers.map((o) => o.category))];
  for (const [index, [id, list]] of Object.entries(spec.lists ?? {}).entries()) {
    // Offers go only into price/service lists; team, reviews, gallery… have no data in a mock brief.
    const offerList = /^(pricing|services) /.test(spec.block);
    const offers = !offerList ? [] : ids.length > 1 ? brief.offers.filter((o) => o.category === categories[index]) : brief.offers;
    for (const key of list.own ?? [])
      values[key] = key.startsWith("heading") ? (categories[index] ?? "") : "";
    lists[id] = (categories[index] === undefined && ids.length > 1 ? [] : offers).slice(0, Math.min(list.max, 6)).map((offer) =>
      Object.fromEntries(
        Object.entries(list.item).map(([key, text]) => [
          key,
          /^(Item heading|Button|Display)/.test(text)
            ? offer.name
            : /^Description/.test(text)
              ? offer.description || "[Short description]"
              : /€|\$|£|price/i.test(text)
                ? offer.price || "[price]"
                : "[mock]",
        ]),
      ),
    );
  }
  return { values, lists };
}
export function mockTranslate(texts: { values: Record<string, string>; lists: Record<string, Record<string, string>[]> }, locale: string) {
  const tag = (v: string) => (v ? `[${locale}] ${v}` : v);
  return {
    values: Object.fromEntries(Object.entries(texts.values).map(([k, v]) => [k, tag(v)])),
    lists: Object.fromEntries(
      Object.entries(texts.lists).map(([id, rows]) => [id, rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, tag(v)])))]),
    ),
  };
}
