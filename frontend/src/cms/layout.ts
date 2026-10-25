import { safeUrl } from "./schema";
export const headerVariants = [
  {
    id: "business",
    label: "Business",
    description: "Logo and action above navigation and phone.",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Centered logo between navigation and contact.",
  },
  {
    id: "band",
    label: "Open navigation",
    description: "A spacious masthead with navigation below.",
  },
  {
    id: "frame",
    label: "Inset",
    description: "An inset layout with generous side spacing.",
  },
  {
    id: "minimal",
    label: "Essential",
    description: "Brand, navigation and a clear action.",
  },
  {
    id: "centered",
    label: "Centered",
    description: "Centered wordmark with navigation below.",
  },
  {
    id: "split",
    label: "Studio",
    description: "Editorial masthead with a contact strip.",
  },
] as const;
export const footerVariants = [
  {
    id: "business",
    label: "Business",
    description: "Contact details, opening hours and navigation.",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Oversized wordmark with a quiet contact row.",
  },
  {
    id: "action",
    label: "Invitation",
    description: "A light contact invitation above the directory.",
  },
  {
    id: "framed",
    label: "Framed",
    description: "An inset dark panel with grouped navigation.",
  },
  { id: "compact", label: "Compact", description: "A quiet, focused ending." },
  {
    id: "columns",
    label: "Directory",
    description: "Brand story, navigation and contact.",
  },
  {
    id: "contact",
    label: "Contact",
    description: "A bold invitation on a dark background.",
  },
] as const;
export interface LayoutMenuItem {
  slug: string;
  label: string;
  parentSlug?: string;
}
export interface SiteLayout {
  header: (typeof headerVariants)[number]["id"];
  footer: (typeof footerVariants)[number]["id"];
  brand: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  hours: string;
  actionLabel: string;
  actionUrl: string;
  copyright: string;
  menus: { header: LayoutMenuItem[]; footer: LayoutMenuItem[] };
}
export const defaultLayout: SiteLayout = {
  header: "minimal",
  footer: "columns",
  brand: "Harbstone",
  tagline: "Thoughtful work. Lasting impact.",
  email: "hello@example.com",
  phone: "+1 (555) 010-2040",
  address: "24 Studio Street, New York",
  hours: "Mon–Fri, 9:00–18:00",
  actionLabel: "Get in touch",
  actionUrl: "mailto:hello@example.com",
  copyright: "All rights reserved.",
  menus: {
    header: [
      { slug: "studio", label: "Studio" },
      { slug: "services", label: "Services" },
    ],
    footer: [
      { slug: "studio", label: "Studio" },
      { slug: "services", label: "Services" },
    ],
  },
};
const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
function link(item: LayoutMenuItem) {
  return `<a class="cms-nav-link" href="/preview/${encodeURIComponent(item.slug)}">${esc(item.label)}</a>`;
}
function navigation(items: LayoutMenuItem[], mobile = false) {
  return items
    .filter((item) => !item.parentSlug)
    .map((item) => {
      const children = items.filter((child) => child.parentSlug === item.slug);
      return children.length
        ? `<details class="cms-nav-group ${mobile ? "cms-nav-group--mobile" : ""}"><summary class="cms-nav-link cursor-pointer">${esc(item.label)}</summary><div class="cms-submenu">${link(item)}${children.map(link).join("")}</div></details>`
        : link(item);
    })
    .join("");
}
function brand(layout: SiteLayout) {
  return `<a class="text-2xl font-semibold tracking-[-0.05em]" href="/preview/studio">${esc(layout.brand)}</a>`;
}
function email(layout: SiteLayout) {
  return layout.email
    ? `<a class="hover:opacity-60" href="${esc(safeUrl(`mailto:${layout.email}`))}">${esc(layout.email)}</a>`
    : "";
}
function phone(layout: SiteLayout) {
  const number = layout.phone.replace(/[^+\d]/g, "");
  return number && layout.phone
    ? `<a class="whitespace-nowrap text-sm font-medium hover:opacity-60" href="tel:${esc(number)}">${esc(layout.phone)}</a>`
    : "";
}
function actionButton(layout: SiteLayout) {
  const url = safeUrl(layout.actionUrl);
  return url && layout.actionLabel
    ? `<a class="cms-layout-action" href="${esc(url)}">${esc(layout.actionLabel)}</a>`
    : "";
}
function headerMarkup(layout: SiteLayout) {
  const action =
    safeUrl(layout.actionUrl) && layout.actionLabel
      ? `<a class="cms-layout-action" href="${esc(safeUrl(layout.actionUrl))}">${esc(layout.actionLabel)}</a>`
      : "";
  const nav = `<nav aria-label="Main navigation" class="hidden flex-wrap items-center justify-center gap-x-7 gap-y-2 @min-[1025px]:flex">${navigation(layout.menus.header)}</nav>`;
  // Lucide TextAlignJustify (ISC), shared by every header variant.
  const menuIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18"/><path d="M3 12h18"/><path d="M3 19h18"/></svg>';
  const closeIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const mobile = `<div class="cms-mobile-menu @min-[1025px]:hidden"><button type="button" data-menu-open class="cms-menu-toggle" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded="false"><span class="cms-menu-icon">${menuIcon}</span><span class="cms-close-icon">${closeIcon}</span></button><dialog data-site-menu class="cms-menu-dialog" aria-label="Site navigation"><nav aria-label="Mobile navigation" class="cms-menu-links">${navigation(layout.menus.header, true)}</nav><div class="mt-auto flex flex-col items-start gap-5 pt-10 pb-6">${phone(layout)}${email(layout)}${action}</div></dialog></div>`;

  const row = "flex min-h-20 items-center justify-between gap-6 py-5";
  const desktop = `<div class="hidden items-center gap-6 @min-[1025px]:flex">${action}</div>`;
  if (layout.header === "business" || layout.header === "band") {
    return `<header class="bg-white text-neutral-900"><div class="cms-shell"><div class="${row}">${brand(layout)}<div class="hidden flex-1 px-6 text-sm text-neutral-500 @min-[1200px]:block">${esc(layout.tagline)}</div>${layout.header === "band" ? `<div class="hidden @min-[1025px]:block">${phone(layout)}</div>` : desktop}${mobile}</div></div><div class="hidden border-t border-black/10 @min-[1025px]:block"><div class="cms-shell flex min-h-14 items-center justify-between gap-8 py-3">${nav}${layout.header === "band" ? action : phone(layout)}</div></div></header>`;
  }
  if (layout.header === "balanced")
    return `<header class="bg-white text-neutral-900"><div class="cms-shell"><div class="${row} @min-[1025px]:grid @min-[1025px]:grid-cols-[1fr_auto_1fr]"><div class="hidden justify-self-start @min-[1025px]:block">${nav}</div>${brand(layout)}<div class="hidden items-center justify-end gap-5 @min-[1025px]:flex"><span class="hidden @5xl:block">${phone(layout)}</span>${action}</div>${mobile}</div></div></header>`;
  if (layout.header === "frame")
    return `<header class="bg-white py-2 text-neutral-900"><div class="cms-shell"><div class="relative flex min-h-20 items-center justify-between gap-6 px-3 py-4 @min-[1025px]:px-6">${brand(layout)}${nav}${desktop}${mobile}</div></div></header>`;
  const strip =
    layout.header === "split"
      ? `<div class="flex flex-wrap justify-between gap-2 border-b border-black/10 py-3 text-xs text-neutral-500"><span>${esc(layout.tagline)}</span>${email(layout)}</div>`
      : "";
  return `<header class="bg-white text-neutral-900"><div class="cms-shell">${strip}<div class="flex min-h-20 flex-wrap items-center justify-between gap-5 py-5 ${layout.header === "centered" ? "@min-[1025px]:justify-center" : ""}">${brand(layout)}${layout.header === "centered" ? "" : nav}<div class="flex items-center gap-5">${layout.header === "centered" ? "" : `<span class="hidden @min-[1025px]:block">${action}</span>`}${mobile}</div></div>${layout.header === "centered" ? `<div class="hidden items-center justify-center gap-8 border-t border-black/10 py-4 @min-[1025px]:flex">${nav}${action}</div>` : ""}</div></header>`;
}
export function renderHeader(layout: SiteLayout) {
  return headerMarkup(layout).replace(
    '<header class="',
    '<header data-site-header class="cms-fixed-header ',
  );
}
export function renderFooter(layout: SiteLayout) {
  const nav = `<nav aria-label="Footer navigation" class="flex flex-wrap gap-x-6 gap-y-3">${layout.menus.footer
    .filter((item) => !item.parentSlug)
    .map(
      (item) =>
        `<div class="flex flex-col gap-3">${link(item)}${layout.menus.footer
          .filter((child) => child.parentSlug === item.slug)
          .map(
            (child) => `<span class="text-sm opacity-60">${link(child)}</span>`,
          )
          .join("")}</div>`,
    )
    .join("")}</nav>`;
  const contacts = `<div class="flex flex-col items-start gap-4">${phone(layout)}${email(layout)}${layout.address ? `<p class="max-w-xs text-sm leading-relaxed opacity-60">${esc(layout.address)}</p>` : ""}${layout.hours ? `<p class="text-sm opacity-60">${esc(layout.hours)}</p>` : ""}</div>`;
  const directory = `<div class="grid gap-10 @3xl:grid-cols-[1.5fr_1fr_1fr]"><div>${brand(layout)}<p class="mt-4 max-w-xs text-sm leading-relaxed opacity-60">${esc(layout.tagline)}</p></div><div><p class="mb-5 text-xs uppercase tracking-widest opacity-50">Explore</p>${nav}</div><div><p class="mb-5 text-xs uppercase tracking-widest opacity-50">Contact</p>${contacts}</div></div>`;
  let body =
    layout.footer === "compact"
      ? `<div class="flex flex-wrap items-start justify-between gap-8">${brand(layout)}${nav}${email(layout)}</div>`
      : layout.footer === "columns"
        ? `<div class="grid gap-10 @3xl:grid-cols-[1.5fr_1fr_1fr]"><div>${brand(layout)}<p class="mt-4 max-w-xs text-sm leading-relaxed opacity-60">${esc(layout.tagline)}</p></div><div><p class="mb-5 text-xs uppercase tracking-widest opacity-50">Explore</p>${nav}</div><div><p class="mb-5 text-xs uppercase tracking-widest opacity-50">Contact</p>${email(layout)}</div></div>`
        : `<div class="mb-12 flex flex-wrap items-end justify-between gap-8"><div><p class="mb-5 text-xs uppercase tracking-widest opacity-50">Let's work together</p><p class="max-w-3xl text-[clamp(32px,5cqw,64px)] leading-tight tracking-[-0.04em]">${esc(layout.tagline)}</p></div><span class="text-lg">${email(layout)}</span></div><div class="flex flex-wrap justify-between gap-8">${brand(layout)}${nav}</div>`;
  if (layout.footer === "framed") body = directory;
  if (layout.footer === "business")
    body = `<div class="mb-10 flex flex-wrap items-start justify-between gap-8">${brand(layout)}${nav}</div><div class="grid gap-8 pt-4 @3xl:grid-cols-3"><div><p class="mb-4 text-xs uppercase tracking-widest opacity-50">Call us</p>${phone(layout)}</div><div><p class="mb-4 text-xs uppercase tracking-widest opacity-50">Write to us</p>${email(layout)}</div><div><p class="mb-4 text-xs uppercase tracking-widest opacity-50">Visit us</p><p class="text-sm leading-relaxed">${esc(layout.address)}</p><p class="mt-2 text-sm opacity-60">${esc(layout.hours)}</p></div></div>`;
  if (layout.footer === "editorial")
    body = `<div class="mb-10 text-[clamp(48px,12cqw,160px)] font-semibold leading-none tracking-[-0.07em]">${esc(layout.brand)}</div><div class="grid gap-8 @3xl:grid-cols-3"><p class="max-w-xs text-sm leading-relaxed opacity-60">${esc(layout.tagline)}</p>${nav}${contacts}</div>`;
  if (layout.footer === "action")
    body = `<div class="mb-12 flex flex-wrap items-end justify-between gap-8 pb-10"><p class="max-w-2xl text-[clamp(32px,4cqw,52px)] leading-tight tracking-[-0.04em]">${esc(layout.tagline)}</p>${actionButton(layout)}</div>${directory}`;
  const dark = layout.footer === "contact" || layout.footer === "framed";
  const inner = `<div class="${layout.footer === "framed" ? "rounded-2xl bg-neutral-950 px-6 py-10 @3xl:px-10" : ""}">${body}<div class="mt-10 pt-5 text-xs opacity-50">${esc(layout.brand)} · ${esc(layout.copyright)}</div></div>`;
  return `<footer class="${layout.footer === "framed" ? "bg-white text-white" : dark ? "bg-neutral-950 text-white" : "bg-neutral-50 text-neutral-900"}"><div class="cms-shell py-12 @3xl:py-16">${inner}</div></footer>`;
}
