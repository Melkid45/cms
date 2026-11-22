/* eslint-disable @next/next/no-img-element */
import { createElement, Fragment } from "react";
import { definition, safeUrl } from "@/lib/builder/catalog";
import { collectionItems } from "@/lib/builder/collections";
import {
  languageHome,
  pageHref,
  siteLanguages,
  translationFor,
  uiText,
} from "@/lib/builder/i18n";
import { richText } from "./rich-text";
import { rootedHref } from "@/lib/builder/domains/names";
import { responsiveImage } from "@/lib/builder/responsive-image";
import type {
  ContentAction,
  Section,
  TemplateNode,
  Project,
  MenuItem,
} from "@/lib/builder/types";
import { SchemaForm } from "./schema-form";
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
  inputmode: "inputMode",
  autoplay: "autoPlay",
  playsinline: "playsInline",
};
// True when the section's main heading would render without text (e.g. a breadcrumbs-only page title):
// the page's H1 then moves to the next section (see SiteCanvas).
export function mainHeadingIsEmpty(section: Section): boolean {
  const entry = definition(section.variant);
  const heading = entry && firstHeading(entry.nodes);
  if (!entry || !heading) return true;
  const text = (node: TemplateNode): string =>
    (node.field ? (section.values[node.field] ?? entry.fields.find((f) => f.key === node.field)?.value ?? "") : "") +
    (node.children || []).map(text).join("");
  return !text(heading).trim();
}
// Blocks whose scripts swap one picture's src for another (product thumbnails, configurator
// options, services accordion) keep plain src images: a srcset would override the swap.
const SWAPPING = ["data-product", "data-configurator", "data-services-accordion"];
// Blocks whose picture boxes follow the picture's own size: team (side photo with height 100% on
// phones) and gallery-v40 (justified rows sized from each picture's ratio). A srcset makes that
// size depend on the copy the browser picks (rounding of the resized copy), so rows move by a
// pixel or more from load to load; these keep plain src images.
const PLAIN_IMAGE_FAMILIES = ["team"];
const PLAIN_IMAGE_VARIANTS = ["gallery-v40"];
const swapping = new WeakMap<TemplateNode[], boolean>();
function swapsImages(nodes: TemplateNode[]): boolean {
  const known = swapping.get(nodes);
  if (known !== undefined) return known;
  const find = (list: TemplateNode[]): boolean =>
    list.some(
      (n) =>
        SWAPPING.some((a) => n.attrs && a in n.attrs) ||
        find(n.children || []) ||
        false,
    );
  const result = find(nodes);
  swapping.set(nodes, result);
  return result;
}
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
  lead = false,
  selectLabel,
  siteKey,
  siteId,
  pageId,
  locale,
  rootLinks = false,
}: {
  section: Section;
  project: Project;
  first?: boolean;
  // The page's first section (above the fold): its images load eagerly too.
  lead?: boolean;
  selectLabel?: string;
  // Public key of the website; page links become /site/{siteKey}/{slug}.
  siteKey?: string;
  // Website id: forms of the form builder (section.form) send enquiries to this website.
  siteId?: string;
  // Current page and its language: menus, logo link and language switcher follow it.
  pageId?: string;
  locale?: string;
  // Request came in on the website's own domain: /site/{key}/… links become /… (custom domains).
  rootLinks?: boolean;
}) {
  const entry = definition(section.variant);
  const link = (href: string) =>
    rootLinks && siteKey ? rootedHref(project, siteKey, href) : href;
  if (!entry || section.hidden) return null;
  const suffix = section.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const mainHeading = firstHeading(entry.nodes);
  const languages = siteLanguages(project);
  const currentLocale = locale || languages?.default;
  const currentPage = project.pages.find((p) => p.id === pageId);
  // Only the first eager image gets fetchpriority=high.
  const priority = { used: false };
  const sharedContact = (value: string) => {
    if (!["header", "footer"].includes(entry.family)) return value;
    if (
      project.website?.contactEmail &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      return project.website.contactEmail;
    if (project.website?.phone && /^\+?[\d ()-]{7,}$/.test(value)) {
      // A local form of the same number ("24 400 900" for "+371 24 400 900") is kept as typed.
      const digits = (s: string) => s.replace(/\D/g, "");
      if (digits(project.website.phone).endsWith(digits(value))) return value;
      return project.website.phone;
    }
    return value;
  };
  // Menus written for one language appear only on that language's pages.
  const menuVisible = (menuLocale?: string) =>
    !menuLocale || !languages || menuLocale === currentLocale;
  const menuItems = (
    items: MenuItem[],
    expanded = false,
  ): React.ReactNode =>
    items.map((item) => {
      const page = project.pages.find((p) => p.id === item.pageId);
      if (item.pageId && (!page || page.deletedAt)) return null;
      const href = link(page ? pageHref(project, siteKey, page) : safeUrl(item.url));
      if (expanded)
        return (
          <div key={item.id} className="builder-menu-column">
            {/* A menu item without a page or address is a heading, not a link (crawlable links). */}
            {href ? (
              <a href={href} className="builder-menu-column__title">
                {item.label}
              </a>
            ) : (
              <span className="builder-menu-column__title">{item.label}</span>
            )}
            {!!item.children.length && (
              <div className="builder-menu-column__links">
                {menuItems(item.children)}
              </div>
            )}
          </div>
        );
      return item.children.length ? (
        <details key={item.id} className="builder-submenu">
          <summary>{item.label}</summary>
          <div>
            <a href={href || undefined}>{item.label}</a>
            {menuItems(item.children)}
          </div>
        </details>
      ) : href ? (
        <a key={item.id} href={href}>
          {item.label}
        </a>
      ) : (
        <span key={item.id}>{item.label}</span>
      );
    });
  function render(
    node: TemplateNode,
    index: number,
    values = section.values,
    instance = "",
    actions: Record<string,ContentAction> = section.actions || {},
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
                  item.actions || section.actions || {},
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
    if (node.tag === "section") {
      props["data-section-id"] = section.id;
      if (section.tone) props["data-tone"] = section.tone;
      if (selectLabel) {
        props.tabIndex = 0;
        props.role = "button";
        props["aria-label"] = selectLabel;
      }
    }
    if (node.tag === "form") {
      // A form of the form builder (section.form, or a website form chosen by id) replaces the
      // template's own form fields; template forms stay as they are (site-runtime.tsx).
      const form =
        section.form ||
        (section.formId
          ? project.formDefinitions?.find((f) => f.id === section.formId)
          : undefined);
      if (form)
        return (
          <SchemaForm
            key={index}
            definition={form}
            pageId={pageId}
            sectionId={section.id}
            siteId={siteId}
            locale={locale}
          />
        );
      props["data-cms-form"] = section.id;
    }
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
          // Background video (hero-v52).
          "autoplay",
          "muted",
          "loop",
          "playsinline",
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
        props.href = link(safeUrl(contact)) || undefined;
        continue;
      }
      if (key === "src" || key === "poster" || key === "data-image") {
        props[name] = safeUrl(value, true) || undefined;
        continue;
      }
      props[name] = value;
    }
    // Button actions (action-picker.tsx): open a form or a service (dialog, drawer or page).
    const action = node.bindings?.href ? actions[node.bindings.href] : undefined;
    if (action?.type === "none" && node.tag === "a") return null;
    if (action && action.type !== "none") {
      const form =
        action.type === "form" &&
        project.formDefinitions?.find((f) => f.id === action.target);
      const service =
        action.type === "service" &&
        project.services?.find((s) => s.id === action.target);
      if (form || service) {
        props.href = service
          ? siteKey
            ? link(`/site/${siteKey}/services/${service.slug}`)
            : "#service"
          : "#enquiry";
        props[form ? "data-content-form" : "data-content-service"] =
          action.target;
        props["data-action-section"] = section.id;
      } else {
        props.href = undefined;
        props["aria-disabled"] = true;
      }
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
    if (node.tag === "section" && selectLabel) {
      delete props["aria-labelledby"];
      props["aria-label"] = selectLabel;
    }
    if (node.tag === "img") {
      if (!props.src) return null;
      // Pictures of the opening section load eagerly (scripts such as the justified gallery measure
      // them on mount; lazy loading there changed anselat's layout); the first one (usually the LCP
      // element) also gets high priority. Everything else is lazy.
      const eager = first || lead;
      props.loading = eager ? "eager" : "lazy";
      if (eager && !priority.used) {
        priority.used = true;
        props.fetchPriority ??= "high";
      } else props.decoding ??= "async";
      // Uploaded images: resized copies for small screens, only on images whose template sets
      // width and height. With a srcset the browser takes the proportions from those attributes,
      // so the height is set to the picture's own ratio (the width stays: CSS may use it) and
      // the box is the same as without a srcset.
      const responsive =
        !props.srcSet &&
        props.width &&
        props.height &&
        !PLAIN_IMAGE_FAMILIES.includes(entry!.family) &&
        !PLAIN_IMAGE_VARIANTS.includes(entry!.id) &&
        !swapsImages(entry!.nodes)
          ? responsiveImage(String(props.src), project.media || [])
          : null;
      if (responsive) {
        const ratio = responsive.width / responsive.height;
        if (Math.abs(Number(props.width) / Number(props.height) / ratio - 1) >= 0.001)
          props.height = Math.round((Number(props.width) / ratio) * 100) / 100;
        props.srcSet = responsive.srcSet;
        props.sizes = eager ? "100vw" : "auto, 100vw";
      }
    }
    // Background video: nothing is downloaded before the page has loaded; site-widgets.ts
    // starts it after the load event, the poster image stays the LCP element.
    if (node.tag === "video" && node.attrs && "data-hero-video" in node.attrs) {
      delete props.autoPlay;
      props.preload = "none";
    }
    const tag = first && node === mainHeading ? "h1" : node.tag;
    if (
      ["header", "footer"].includes(entry!.family) &&
      node.tag === "a" &&
      node.attrs?.href?.includes("composition-")
    ) {
      const home =
        (currentLocale && languageHome(project, currentLocale)) ||
        project.pages.find((p) => p.id === project.layout.homePageId);
      props.href = link(
        pageHref(project, siteKey, home || { slug: "home", locale: "" }),
      );
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
    if (node.attrs && "data-lang-switcher" in node.attrs) {
      // Optional language switcher: empty on single-language websites.
      if (!languages) return null;
      const links = languages.enabled.flatMap((code) => {
        const target = translationFor(project, currentPage, code);
        if (!target && code !== currentLocale) return [];
        const active = code === currentLocale;
        return [
          <a
            key={code}
            className="lang-switcher__link"
            href={target ? link(pageHref(project, siteKey, target)) : undefined}
            hrefLang={code}
            lang={code}
            aria-current={active ? "true" : undefined}
          >
            {code.toUpperCase()}
          </a>,
        ];
      });
      if (links.length < 2) return null;
      return createElement(
        node.tag,
        {
          ...props,
          className: `lang-switcher ${node.attrs.class || ""}`.trim(),
          role: "navigation",
          "aria-label": uiText(currentLocale).language,
        },
        ...links,
      );
    }
    if (["header", "footer"].includes(entry!.family) && node.tag === "nav") {
      const expanded = !!node.attrs && "data-menu-expanded" in node.attrs;
      const ids =
        entry!.family === "header"
          ? project.layout.headerMenus
          : project.layout.footerMenus;
      return createElement(
        "nav",
        props,
        ...ids.map((id) => {
          const menu = project.menus.find((m) => m.id === id);
          return menu && menuVisible(menu.locale) ? (
            <div className="builder-menu-group" key={id}>
              {entry!.family === "footer" && ids.length > 1 && (
                <p className="text text--sm text--muted">{menu.title}</p>
              )}
              {menuItems(menu.items, expanded)}
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
      // Formatted text (lists, bold, links) renders as a block container.
      if (node.attrs && "data-rich-text" in node.attrs)
        return createElement(
          "div",
          { ...props, className: `rich-text ${props.className || ""}`.trim() },
          ...richText(value, link),
        );
      children = value.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ));
    } else
      children = node.children?.map((child, index) =>
        render(child, index, values, instance, actions),
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
