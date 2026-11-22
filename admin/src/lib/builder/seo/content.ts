// What a published page actually shows, read from its sections the same way
// SectionRenderer renders them (field values, template defaults, repeated cards).
// Client-safe: used by the SEO audit in the editor and by the server (JSON-LD, OG images).
import { definition } from "../catalog";
import { collectionItems } from "../collections";
import type { Section, TemplateNode } from "../types";

interface Node {
  tag: string;
  cls: string;
  attrs: Record<string, string>;
  text: string;
  children: Node[];
}
export interface PageHeading {
  level: number;
  text: string;
  sectionId: string;
}
export interface PageImage {
  src: string;
  alt: string;
  sectionId: string;
}
export interface PageLink {
  href: string;
  text: string;
  sectionId: string;
}
export interface PageProduct {
  sectionId: string;
  name: string;
  description: string;
  priceText: string;
  price: number;
  currency: string;
  images: string[];
  availability?: "InStock" | "PreOrder" | "OutOfStock";
}
export interface PageContent {
  headings: PageHeading[];
  images: PageImage[];
  links: PageLink[];
  faqs: { question: string; answer: string; sectionId: string }[];
  products: PageProduct[];
  heroImage: string;
  // The page's H1 element is rendered but its text is empty.
  emptyH1: boolean;
  words: number;
  // Readable text in page order: "## heading" lines and paragraphs (llms-full.txt, AI checks).
  outline: string[];
}

function firstHeading(nodes: TemplateNode[]): TemplateNode | undefined {
  for (const node of nodes) {
    if (node.tag && /^h[1-6]$/.test(node.tag)) return node;
    const found = firstHeading(node.children || []);
    if (found) return found;
  }
}
// Plain tree of one section; the first section's first heading becomes h1 (as rendered).
function tree(section: Section, first: boolean): Node[] {
  const entry = definition(section.variant);
  if (!entry) return [];
  const main = first ? firstHeading(entry.nodes) : undefined;
  const value = (values: Record<string, string>, key: string) =>
    values[key] ?? entry.fields.find((f) => f.key === key)?.value ?? "";
  const walk = (node: TemplateNode, values: Record<string, string>): Node[] => {
    if (node.repeat) {
      const group = entry.repeaters?.find((r) => r.id === node.repeat);
      if (!group) return [];
      return collectionItems(section, entry, group).flatMap((item) => {
        const template = group.items[item.template];
        return template ? walk(template.node, { ...section.values, ...item.values }) : [];
      });
    }
    if (node.text !== undefined)
      return [{ tag: "#text", cls: "", attrs: {}, text: node.text, children: [] }];
    if (!node.tag)
      return node.field
        ? [{ tag: "#text", cls: "", attrs: {}, text: value(values, node.field), children: [] }]
        : [];
    if (["script", "style", "link", "svg"].includes(node.tag)) return [];
    const attrs = { ...node.attrs };
    for (const [name, key] of Object.entries(node.bindings || {}))
      attrs[name] = value(values, key);
    return [
      {
        tag: node === main ? "h1" : node.tag,
        cls: ` ${attrs.class || ""} `,
        attrs,
        text: node.field ? value(values, node.field) : "",
        children: node.field ? [] : (node.children || []).flatMap((c) => walk(c, values)),
      },
    ];
  };
  return entry.nodes.flatMap((node) => walk(node, section.values));
}
const all = (nodes: Node[], test: (n: Node) => boolean): Node[] =>
  nodes.flatMap((n) => [...(test(n) ? [n] : []), ...all(n.children, test)]);
const first = (nodes: Node[], test: (n: Node) => boolean) => all(nodes, test)[0];
const byClass = (name: string) => (n: Node) => n.cls.includes(` ${name} `);
const textOf = (n?: Node): string =>
  n ? (n.text + " " + n.children.map(textOf).join(" ")).replace(/\s+/g, " ").trim() : "";
// "€1,250", "1 499 €", "1499.00 EUR" → 1250 / 1499.
export function priceNumber(value: string) {
  const m = value
    .replace(/[\s ]/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : NaN;
}
const CURRENCIES: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP" };
export const currencyCode = (value: string) => {
  const found = value.match(/[€$£]|EUR|USD|GBP/)?.[0] || "€";
  return CURRENCIES[found] ?? found;
};
const backgroundUrl = (style = "") =>
  style.match(/url\(\s*['"]?([^'")\s]+)/)?.[1] || "";
const imageOf = (n: Node) =>
  n.tag === "img" ? n.attrs.src || "" : n.attrs["data-image"] || backgroundUrl(n.attrs.style);

export function pageContent(sections: Section[]): PageContent {
  const content: PageContent = {
    headings: [],
    images: [],
    links: [],
    faqs: [],
    products: [],
    heroImage: "",
    emptyH1: false,
    words: 0,
    outline: [],
  };
  const visible = sections.filter((s) => !s.hidden && definition(s.variant));
  let text = "";
  // As SiteCanvas: when the first section's main heading is empty (breadcrumbs-only title), the next section's is the H1.
  const emptyMain = (section: Section) => {
    const h1 = first(tree(section, true), (n) => n.tag === "h1");
    return !h1 || !textOf(h1);
  };
  const h1Index = visible.length > 1 && emptyMain(visible[0]) ? 1 : 0;
  visible.forEach((section, index) => {
    const nodes = tree(section, index === h1Index);
    const sectionId = section.id;
    for (const h of all(nodes, (n) => /^h[1-6]$/.test(n.tag))) {
      const value = textOf(h);
      if (value) content.headings.push({ level: Number(h.tag[1]), text: value, sectionId });
      else if (h.tag === "h1") content.emptyH1 = true;
    }
    for (const img of all(nodes, (n) => n.tag === "img" && !!n.attrs.src))
      content.images.push({ src: img.attrs.src, alt: (img.attrs.alt || "").trim(), sectionId });
    for (const a of all(nodes, (n) => n.tag === "a" && !!n.attrs.href))
      content.links.push({ href: a.attrs.href.trim(), text: textOf(a), sectionId });
    if (!content.heroImage) {
      const hero = first(nodes, (n) => !!imageOf(n));
      if (hero) content.heroImage = imageOf(hero);
    }
    // FAQ: <details> items with a <summary> question (faq family and any accordion of questions).
    if (definition(section.variant)?.family === "faq")
      for (const item of all(nodes, (n) => n.tag === "details")) {
        const summary = first(item.children, (n) => n.tag === "summary");
        const question = textOf(summary);
        const answer = item.children
          .filter((c) => c !== summary)
          .map(textOf)
          .join(" ")
          .trim();
        if (question && answer) content.faqs.push({ question, answer, sectionId });
      }
    // Product page (pricing-v22 and any block marked data-product).
    if (first(nodes, (n) => "data-product" in n.attrs)) {
      const info = first(nodes, byClass("pricing__pd-info"));
      const name = textOf(first(info ? [info] : nodes, (n) => /^h[1-6]$/.test(n.tag)));
      const priceText = textOf(first(nodes, (n) => "data-product-price" in n.attrs));
      const facts = all(nodes, byClass("pricing__pd-fact")).map(textOf).join(" ");
      const availability = /noliktav|in stock|в наличии|pieejam/i.test(facts)
        ? "InStock"
        : /izpārdots|out of stock|нет в наличии/i.test(facts)
          ? "OutOfStock"
          : undefined;
      if (name)
        content.products.push({
          sectionId,
          name,
          description: textOf(first(nodes, byClass("pricing__pd-sub"))),
          priceText,
          price: priceNumber(priceText),
          currency: currencyCode(priceText),
          images: all(first(nodes, (n) => "data-product-gallery" in n.attrs)?.children || [], (n) => n.tag === "img")
            .map((n) => n.attrs.src)
            .filter(Boolean)
            .filter((v, i, list) => list.indexOf(v) === i),
          availability,
        });
    }
    const read = (list: Node[]) => {
      for (const n of list) {
        if (/^h[1-6]$/.test(n.tag)) {
          const value = textOf(n);
          if (value) content.outline.push("#".repeat(Number(n.tag[1]) + 1) + " " + value);
        } else if (["p", "li", "dd", "dt", "blockquote", "figcaption", "td"].includes(n.tag)) {
          const value = textOf(n);
          if (value) content.outline.push(value);
        } else if (!["a", "button", "nav", "form", "select", "label"].includes(n.tag)) read(n.children);
      }
    };
    read(nodes);
    text += " " + nodes.map(textOf).join(" ");
  });
  content.words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return content;
}
