// Compile approved source templates into React node descriptions and editable fields.
// The renderer never executes arbitrary HTML or stores layout markup in page content.
import { parseFragment } from "parse5";
import { readFile, readdir, writeFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import {compileRepeaters} from './repeaters.mjs';
const root = path.resolve(import.meta.dirname, "../../frontend");
const output = path.resolve(import.meta.dirname, "../src/lib/builder");
const families = [
  "hero",
  "about",
  "services",
  "advantages",
  "content",
  "projects",
  "gallery",
  "process",
  "pricing",
  "testimonials",
  "faq",
  "contact",
  "header",
  "footer",
];
const definitions = [];
const titles = {
  hero: "Hero",
  about: "About",
  services: "Services",
  advantages: "Advantages",
  content: "Content",
  projects: "Projects",
  gallery: "Gallery",
  process: "Process",
  pricing: "Pricing",
  testimonials: "Testimonials",
  faq: "FAQ",
  contact: "Contact",
  header: "Header",
  footer: "Footer",
};
for (const family of families) {
  const directory = path.join(
    root,
    "src/components",
    ["header", "footer"].includes(family) ? "layout" : "sections",
    family,
  );
  for (const file of (await readdir(directory))
    .filter((f) => new RegExp(`^${family}-v\\d+\\.html$`).test(f))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
    const id = file.replace(".html", "");
    const document = parseFragment(
      await readFile(path.join(directory, file), "utf8"),
    );
    const fields = [],
      counters = {};
    const add = (type, label, value, group = "Content", role = label) => {
      const key = `${type}-${(counters[type] = (counters[type] || 0) + 1)}`;
      fields.push({ key, type, label, value, group, role });
      return key;
    };
    const textOf = (node) =>
      node.nodeName === "#text"
        ? node.value
        : node.tagName === "br"
          ? "\n"
          : (node.childNodes || []).map(textOf).join("");
    const inline = (node) =>
      node.nodeName === "#text" ||
      (["br", "strong", "em", "b", "i", "sup", "small"].includes(
        node.tagName,
      ) &&
        (node.childNodes || []).every(inline));
    function convert(node, group = "Content") {
      if (node.nodeName === "#text") {
        if (
          node.value.trim() &&
          ["a", "button", "label", "p", "span", "summary"].includes(
            node.parentNode?.tagName,
          )
        ) {
          return {
            field: add(
              "text",
              ["a", "button"].includes(node.parentNode.tagName)
                ? "Button / link label"
                : "Text",
              node.value.trim(),
              group,
            ),
          };
        }
        return { text: node.value };
      }
      if (!node.tagName || ["link", "script", "style"].includes(node.tagName))
        return null;
      const attrs = Object.fromEntries(
        node.attrs.map((a) => [a.name, a.value]),
      );
      if (
        ["article", "details"].includes(node.tagName) ||
        (node.tagName === "li" && attrs.class?.includes("splide__slide"))
      ) {
        const heading = (node.childNodes || [])
          .map(textOf)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        group = heading.slice(0, 55) || "Item";
      }
      const result = { tag: node.tagName, attrs, children: [] };
      if (
        ["header", "footer"].includes(family) &&
        (node.tagName === "nav" ||
          (node.tagName === "a" && attrs.href?.includes("composition-")))
      )
        return result;
      const bindings = {};
      if (node.tagName === "img") {
        bindings.src = add("image", "Image", attrs.src || "", group);
        bindings.alt = add("text", "Image description", attrs.alt || "", group);
      }
      if (attrs["data-image"])
        bindings["data-image"] = add(
          "image",
          "Panel image",
          attrs["data-image"],
          group,
        );
      if (node.tagName === "a" && attrs.href)
        bindings.href = add("url", "Link destination", attrs.href, group);
      if (attrs.placeholder)
        bindings.placeholder = add(
          "text",
          "Placeholder",
          attrs.placeholder,
          group,
        );
      if (Object.keys(bindings).length) result.bindings = bindings;
      if (
        [
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "p",
          "a",
          "span",
          "blockquote",
          "button",
          "dt",
          "dd",
          "label",
          "legend",
          "option",
        ].includes(node.tagName) &&
        node.childNodes?.length &&
        node.childNodes.every(inline) &&
        textOf(node).trim()
      ) {
        const heading =
          /^h[1-6]$/.test(node.tagName) || attrs.class?.includes("heading");
        const eyebrow =
          attrs.class?.includes("eyebrow") ||
          attrs.class?.includes("text--label");
        result.field = add(
          heading
            ? "heading"
            : ["p", "blockquote"].includes(node.tagName)
              ? "textarea"
              : "text",
          heading
            ? "Heading"
            : node.tagName === "a" || node.tagName === "button"
              ? "Button / link label"
              : node.tagName === "blockquote"
                ? "Quote"
                : eyebrow
                  ? "Eyebrow"
                  : node.tagName === "p"
                    ? "Description"
                    : "Text",
          textOf(node).trim(),
          group,
          node.tagName === "h2"
            ? "Main heading"
            : heading && /^h/.test(node.tagName)
              ? "Item heading"
              : heading
                ? "Display text"
                : eyebrow
                  ? "Eyebrow"
                  : node.tagName === "p"
                    ? "Description"
                    : node.tagName === "blockquote"
                      ? "Quote"
                      : ["a", "button"].includes(node.tagName)
                        ? "Button / link label"
                        : "Text",
        );
      } else
        result.children = (node.childNodes || [])
          .map((child) => convert(child, group))
          .filter(Boolean);
      return result;
    }
    const nodes = document.childNodes
      .map((n) => convert(n))
      .filter(Boolean)
      .filter((n) => !n.text?.trim() === false || n.tag);
    const section = nodes.find((n) =>
      ["section", "header", "footer"].includes(n.tag),
    );
    const modifier =
      section?.attrs?.class
        ?.split(" ")
        .find((c) => c.includes("--"))
        ?.split("--")[1] || `Variation ${id.split("-v")[1]}`;
    const compiled=compileRepeaters(nodes.filter(n=>n.tag),family);
    definitions.push({
      id,
      family,
      label: modifier
        .replaceAll("-", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      title: titles[family],
      fields,
      nodes: compiled.nodes,
      repeaters: compiled.repeaters,
      thumbnail: `/previews/${id}.webp`,
    });
  }
}
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "catalog.json"), JSON.stringify(definitions));
await mkdir(path.resolve(import.meta.dirname, "../public/images"), {
  recursive: true,
});
await cp(
  path.join(root, "public/images"),
  path.resolve(import.meta.dirname, "../public/images"),
  { recursive: true },
);
console.log(
  `Imported ${definitions.length} approved variants across ${families.length} families.`,
);
