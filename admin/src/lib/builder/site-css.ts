import "server-only";
import { createHash } from "node:crypto";
import data from "./site-css.json";
import { definition } from "./catalog";
import type { Section, TemplateNode } from "./types";
// Which parts of the library CSS a public page needs (scripts/build-site-css.mjs): base, the
// families of its sections and of the header/footer, refresh and the website shell ("site"), in
// the order of site.scss. A family is also included when a template uses its classes (e.g. a
// services block with faq__ items), rich text (content), pop-up sections (calculator) or the
// account / search / chat pop-ups (contact: the header account menu is styled there).
// connected-content (forms of the form builder, service dialogs), cart (cart window) and
// button-theme (button looks) are small and may be needed by any page.
const ALWAYS = new Set([
  "base",
  "header",
  "footer",
  "refresh",
  "site",
  "connected-content",
  "cart",
  "button-theme",
  "store-controls",
]);
const families = new Set(data.order.filter((id) => !ALWAYS.has(id)));
const hashes = data.hashes as Record<string, string>;
function scan(nodes: TemplateNode[], used: Set<string>) {
  for (const node of nodes) {
    const attrs = node.attrs || {};
    for (const name of (attrs.class || "").split(/\s+/)) {
      const block = name.split(/__|--/)[0];
      if (families.has(block)) used.add(block);
    }
    if ("data-rich-text" in attrs) used.add("content");
    if ("data-modal" in attrs) used.add("calculator");
    if (/^#(account|search|chat)\b/.test(attrs.href || "")) used.add("contact");
    scan(node.children || [], used);
  }
}
// The one stylesheet of a page: /api/site-css/<part>+<part>….<hash>.css (app/api/site-css/[bundle]).
// The hash covers the parts' contents, so the URL changes whenever the CSS does (immutable cache).
export function siteCssHref(sections: Section[]) {
  const ids = siteCssParts(sections);
  if (process.env.NODE_ENV === "development") return `/api/site-css/${ids.join("+")}`;
  const hash = createHash("sha256").update(ids.map((id) => hashes[id]).join()).digest("hex").slice(0, 10);
  return `/api/site-css/${ids.join("+")}.${hash}.css`;
}
export function siteCssParts(sections: Section[]) {
  const used = new Set<string>();
  for (const section of sections) {
    if (section.hidden) continue;
    const entry = definition(section.variant);
    if (!entry) continue;
    used.add(entry.family);
    scan(entry.nodes, used);
    for (const group of entry.repeaters || [])
      scan(group.items.map((item) => item.node), used);
  }
  // <family>-explorations parts (origin/main variants) load with their family.
  return data.order.filter(
    (id) =>
      ALWAYS.has(id) ||
      used.has(id) ||
      used.has(id.replace(/-explorations$/, "")),
  );
}
