/* eslint-disable @next/next/no-img-element */
import { createElement, Fragment } from "react";
import { definition, safeUrl } from "@/lib/builder/catalog";
import { collectionItems } from "@/lib/builder/collections";
import type {
  Section,
  TemplateNode,
  Project,
  MenuItem,
} from "@/lib/builder/types";
const camel = (key: string) =>
  key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const names: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "fill-rule": "fillRule",
  "clip-rule": "clipRule",
  viewbox: "viewBox",
  fetchpriority: "fetchPriority",
  srcset: "srcSet",
  colspan: "colSpan",
  rowspan: "rowSpan",
  maxlength: "maxLength",
  autocomplete: "autoComplete",
  readonly: "readOnly",
};
function firstHeading(nodes: TemplateNode[]): TemplateNode | undefined {
  for (const node of nodes) {
    if (node.tag && /^h[1-6]$/.test(node.tag)) return node;
    const found = firstHeading(node.children || []);
    if (found) return found;
  }
}
export function SectionRenderer({
  section,
  project,
  first = false,
}: {
  section: Section;
  project: Project;
  first?: boolean;
}) {
  const entry = definition(section.variant);
  if (!entry || section.hidden) return null;
  const suffix = section.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const mainHeading = firstHeading(entry.nodes);
  const sharedContact = (value: string) => {
    if (!["header", "footer"].includes(entry.family)) return value;
    if (
      project.website?.contactEmail &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      return project.website.contactEmail;
    if (project.website?.phone && /^\+?[\d ()-]{7,}$/.test(value))
      return project.website.phone;
    return value;
  };
  const menuItems = (items: MenuItem[]): React.ReactNode =>
    items.map((item) => {
      const page = project.pages.find((p) => p.id === item.pageId);
      if (item.pageId && (!page || page.deletedAt)) return null;
      const href = page ? `/site/${page.slug}` : safeUrl(item.url);
      return item.children.length ? (
        <details key={item.id} className="builder-submenu">
          <summary>{item.label}</summary>
          <div>
            <a href={href || undefined}>{item.label}</a>
            {menuItems(item.children)}
          </div>
        </details>
      ) : (
        <a key={item.id} href={href || undefined}>
          {item.label}
        </a>
      );
    });
  function render(
    node: TemplateNode,
    index: number,
    values = section.values,
    instance = "",
  ): React.ReactNode {
    const rewriteId = (value: string) => `${suffix}${instance}-${value}`;
    if (node.repeat) {
      const group = entry!.repeaters?.find((r) => r.id === node.repeat);
      if (!group) return null;
      return (
        <Fragment key={index}>
          {collectionItems(section, entry!, group).map((item) => {
            const template = group.items[item.template];
            return template ? (
              <Fragment key={item.id}>
                {render(
                  template.node,
                  0,
                  { ...section.values, ...item.values },
                  `-${item.id}`,
                )}
              </Fragment>
            ) : null;
          })}
        </Fragment>
      );
    }
    if (node.text !== undefined) return node.text;
    if (!node.tag && node.field)
      return sharedContact(
        values[node.field] ??
          entry!.fields.find((f) => f.key === node.field)?.value ??
          "",
      );
    if (!node.tag || ["script", "style", "link"].includes(node.tag))
      return null;
    const props: Record<string, unknown> = { key: index };
    if (node.tag === "section") props["data-section-id"] = section.id;
    if (node.tag === "form") props["data-cms-form"] = section.id;
    const attrs = { ...node.attrs };
    for (const [name, key] of Object.entries(node.bindings || {}))
      attrs[name] =
        values[key] ?? entry!.fields.find((f) => f.key === key)?.value ?? "";
    for (const [key, value] of Object.entries(attrs)) {
      if (/^on/i.test(key) || key === "srcdoc") continue;
      const name =
        names[key] ??
        (key.startsWith("data-") || key.startsWith("aria-") ? key : camel(key));
      if (key === "style") {
        props.style = Object.fromEntries(
          value
            .split(";")
            .filter(Boolean)
            .map((part) => {
              const at = part.indexOf(":");
              return [
                camel(part.slice(0, at).trim()),
                part.slice(at + 1).trim(),
              ];
            }),
        );
        continue;
      }
      if (key === "id") {
        props.id = rewriteId(value);
        continue;
      }
      if (
        ["aria-labelledby", "aria-controls", "aria-describedby"].includes(key)
      ) {
        props[key] = value.split(" ").map(rewriteId).join(" ");
        continue;
      }
      if (
        [
          "hidden",
          "open",
          "required",
          "disabled",
          "multiple",
          "checked",
          "selected",
        ].includes(key)
      ) {
        props[name] = true;
        continue;
      }
      if (key === "href") {
        const contact = ["header", "footer"].includes(entry!.family)
          ? value.startsWith("mailto:") && project.website?.contactEmail
            ? `mailto:${project.website.contactEmail}`
            : value.startsWith("tel:") && project.website?.phone
              ? `tel:${project.website.phone.replace(/[^+\d]/g, "")}`
              : value
          : value;
        props.href = safeUrl(contact) || undefined;
        continue;
      }
      if (key === "src" || key === "poster" || key === "data-image") {
        props[name] = safeUrl(value, true) || undefined;
        continue;
      }
      props[name] = value;
    }
    if (node.tag === "input") {
      if (attrs.value) {
        props.defaultValue = attrs.value;
        delete props.value;
      }
      if (props.checked) {
        props.defaultChecked = true;
        delete props.checked;
      }
    }
    if (node.tag === "img") {
      props.loading = first ? "eager" : "lazy";
      if (!props.src) return null;
    }
    const tag = first && node === mainHeading ? "h1" : node.tag;
    if (
      ["header", "footer"].includes(entry!.family) &&
      node.tag === "a" &&
      node.attrs?.href?.includes("composition-")
    ) {
      props.href = `/site/${project.pages.find((p) => p.id === project.layout.homePageId)?.slug || "home"}`;
      props["aria-label"] = `${project.brand.name} home`;
      const logo =
        entry!.family === "footer"
          ? project.brand.footerLogo || project.brand.logo
          : project.brand.logo;
      return createElement(
        "a",
        props,
        logo ? (
          <img
            src={safeUrl(logo, true)}
            alt={project.brand.name}
            className="builder-logo"
          />
        ) : (
          project.brand.name
        ),
      );
    }
    if (["header", "footer"].includes(entry!.family) && node.tag === "nav") {
      const ids =
        entry!.family === "header"
          ? project.layout.headerMenus
          : project.layout.footerMenus;
      return createElement(
        "nav",
        props,
        ...ids.map((id) => {
          const menu = project.menus.find((m) => m.id === id);
          return menu ? (
            <div className="builder-menu-group" key={id}>
              {entry!.family === "footer" && ids.length > 1 && (
                <p className="text text--sm text--muted">{menu.title}</p>
              )}
              {menuItems(menu.items)}
            </div>
          ) : null;
        }),
      );
    }
    let children: React.ReactNode[] | undefined;
    if (node.field) {
      const value = sharedContact(
        values[node.field] ??
          entry!.fields.find((f) => f.key === node.field)?.value ??
          "",
      );
      // Static prototype notices predate connected forms; the canvas supplies live status.
      if (value === "Preview form. No data is sent.") return null;
      children = value.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ));
    } else
      children = node.children?.map((child, index) =>
        render(child, index, values, instance),
      );
    if (
      [
        "img",
        "input",
        "br",
        "hr",
        "source",
        "wbr",
        "area",
        "embed",
        "meta",
      ].includes(tag)
    )
      return createElement(tag, props);
    return createElement(tag, props, ...(children || []));
  }
  return <>{entry.nodes.map((node, index) => render(node, index))}</>;
}
