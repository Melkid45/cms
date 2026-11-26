// Editable text slots of a page, read from its sections the way SectionRenderer renders them
// (same walk as seo/content.ts) but keeping the field address of every heading, paragraph,
// image alt text and link, so the AI SEO assistant can propose a change to exactly that field
// and apply it later. Client-safe.
import { definition } from "../catalog";
import { collectionItems } from "../collections";
import type { Section, TemplateNode } from "../types";

// Where a value lives: section.values[key], or one card of a repeated list.
export interface FieldTarget {
  sectionId: string;
  key: string;
  collection?: string;
  itemId?: string;
}
export interface TextSlot extends FieldTarget {
  ref: string; // short id for prompts ("s4")
  variant: string;
  family: string;
  sectionIndex: number;
  kind: "heading" | "text" | "alt" | "link";
  level?: number; // headings: 1–6 as rendered (first heading of the first section = 1)
  rich: boolean; // data-rich-text: blank line = paragraph, [label](url) links
  value: string;
  image?: string; // alt: the image address
  context?: string; // alt: heading + text around the image
  href?: string; // link: target
}

const plain = (value: string) => value.replace(/\s+/g, " ").trim();
export const sameTarget = (a: FieldTarget, b: FieldTarget) =>
  a.sectionId === b.sectionId && a.key === b.key && (a.itemId || "") === (b.itemId || "");

export function pageSlots(sections: Section[]): TextSlot[] {
  const slots: TextSlot[] = [];
  const visible = sections.filter((s) => !s.hidden && definition(s.variant));
  let mainDone = false;
  visible.forEach((section, sectionIndex) => {
    const entry = definition(section.variant)!;
    const fieldValue = (values: Record<string, string>, key: string) =>
      values[key] ?? entry.fields.find((f) => f.key === key)?.value ?? "";
    let firstHeading = sectionIndex === 0;
    const sectionSlots: TextSlot[] = [];
    const add = (slot: Omit<TextSlot, "ref" | "variant" | "family" | "sectionIndex" | "sectionId">) =>
      sectionSlots.push({
        ...slot,
        ref: "",
        sectionId: section.id,
        variant: section.variant,
        family: entry.family,
        sectionIndex,
      });
    const walk = (
      node: TemplateNode,
      values: Record<string, string>,
      item?: { collection: string; itemId: string },
    ) => {
      if (node.repeat) {
        const group = entry.repeaters?.find((r) => r.id === node.repeat);
        if (!group) return;
        for (const one of collectionItems(section, entry, group)) {
          const template = group.items[one.template];
          if (!template) continue;
          // Items not stored yet ("initial-N") read their values from section.values.
          const stored = !one.id.startsWith("initial-");
          walk(
            template.node,
            stored ? { ...section.values, ...one.values } : section.values,
            stored ? { collection: group.id, itemId: one.id } : undefined,
          );
        }
        return;
      }
      if (!node.tag || ["script", "style", "svg", "form", "select"].includes(node.tag)) return;
      const at = (key: string) => ({ key, ...(item ? { collection: item.collection, itemId: item.itemId } : {}) });
      if (node.tag === "img" && node.bindings?.alt) {
        const src = node.bindings.src ? fieldValue(values, node.bindings.src) : node.attrs?.src || "";
        if (src)
          add({ ...at(node.bindings.alt), kind: "alt", rich: false, value: fieldValue(values, node.bindings.alt), image: src });
      }
      if (node.tag === "a" && node.field) {
        add({
          ...at(node.field),
          kind: "link",
          rich: false,
          value: fieldValue(values, node.field),
          href: node.bindings?.href ? fieldValue(values, node.bindings.href) : node.attrs?.href || "",
        });
        return;
      }
      if (node.field) {
        const value = fieldValue(values, node.field);
        const rich = node.attrs ? "data-rich-text" in node.attrs : false;
        if (/^h[1-6]$/.test(node.tag)) {
          const level = firstHeading && !mainDone ? 1 : Number(node.tag[1]);
          if (level === 1) mainDone = true;
          firstHeading = false;
          add({ ...at(node.field), kind: "heading", level, rich, value });
        } else if (!["button", "label", "option", "time"].includes(node.tag)) {
          if (/[\p{L}]/u.test(value) && !/^(https?:|mailto:|tel:|\/|#)/.test(value.trim()))
            add({ ...at(node.field), kind: "text", rich, value });
        }
        return;
      }
      for (const child of node.children || []) walk(child, values, item);
    };
    for (const node of entry.nodes) walk(node, section.values);
    // Context for image alt texts: the section's headings and first text.
    const context = plain(
      sectionSlots
        .filter((s) => s.kind === "heading" || s.kind === "text")
        .slice(0, 4)
        .map((s) => s.value)
        .join(" · "),
    ).slice(0, 300);
    for (const slot of sectionSlots) if (slot.kind === "alt") slot.context = context;
    slots.push(...sectionSlots);
  });
  slots.forEach((slot, i) => (slot.ref = `s${i + 1}`));
  return slots;
}

// Reads / writes the value a target points at on a list of sections (draft or published copy).
export function readTarget(sections: Section[], target: FieldTarget): string | undefined {
  const section = sections.find((s) => s.id === target.sectionId);
  if (!section) return undefined;
  if (target.itemId) {
    const item = section.collections?.[target.collection || ""]?.find((i) => i.id === target.itemId);
    if (!item) return undefined;
    return item.values[target.key] ?? "";
  }
  const entry = definition(section.variant);
  return section.values[target.key] ?? entry?.fields.find((f) => f.key === target.key)?.value ?? "";
}
export function writeTarget(sections: Section[], target: FieldTarget, value: string) {
  const section = sections.find((s) => s.id === target.sectionId);
  if (!section) return false;
  if (target.itemId) {
    const item = section.collections?.[target.collection || ""]?.find((i) => i.id === target.itemId);
    if (!item) return false;
    item.values[target.key] = value;
    return true;
  }
  section.values[target.key] = value;
  return true;
}
