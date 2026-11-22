import type { SiteStyle } from "./style-presets";
// "video": a video file of the website media (hero-v52 background video).
export type FieldType = "heading" | "textarea" | "text" | "url" | "image" | "video";
export interface Field {
  key: string;
  type: FieldType;
  label: string;
  value: string;
  group: string;
  role?: string;
}
export interface TemplateNode {
  repeat?: string;
  tag?: string;
  text?: string;
  attrs?: Record<string, string>;
  bindings?: Record<string, string>;
  field?: string;
  children?: TemplateNode[];
}
export interface Definition {
  repeaters?: Repeater[];
  id: string;
  family: string;
  label: string;
  title: string;
  fields: Field[];
  nodes: TemplateNode[];
  thumbnail: string;
}
export interface Section {
  clientAccess?: SectionAccess;
  id: string;
  variant: string;
  values: Record<string, string>;
  hidden?: boolean;
  // Section background for page rhythm: brand-tinted, dark (inverted) or accent colour.
  tone?: "tint" | "dark" | "accent";
  collections?: Record<string, CollectionItem[]>;
}
export interface CollectionItem {
  id: string;
  template: number;
  values: Record<string, string>;
}
export interface Repeater {
  id: string;
  label: string;
  // Upper limit of items in this group (default 30).
  max?: number;
  items: { node: TemplateNode; fields: string[] }[];
}
export interface PageSnapshot {
  title: string;
  slug: string;
  locale: string;
  sections: Section[];
  seo: CmsPage["seo"];
  updatedAt: string;
}
export interface PageVersion extends PageSnapshot {
  id: string;
  kind: "Draft saved" | "Published" | "Moved to trash" | "Restored";
}
export interface CmsPage {
  clientAccess?: { edit: boolean; publish: boolean };
  published?: PageSnapshot;
  history?: PageVersion[];
  deletedAt?: string;
  id: string;
  title: string;
  slug: string;
  locale: string;
  // Pages sharing a group id are translations of each other (one page per locale).
  translationGroup?: string;
  status: "Draft" | "Published";
  sections: Section[];
  seo: {
    title: string;
    description: string;
    keywords: string;
    image: string;
    noindex: boolean;
    // Social card texts (empty = SEO title / description) and a canonical URL override.
    ogTitle?: string;
    ogDescription?: string;
    canonical?: string;
  };
  updatedAt: string;
}
export interface SectionAccess {
  collections?: string[];
  text: boolean;
  images: boolean;
  reorder: boolean;
  lockedFields: string[];
}
export interface MenuItem {
  id: string;
  label: string;
  pageId: string;
  url: string;
  children: MenuItem[];
}
export interface Menu {
  id: string;
  title: string;
  items: MenuItem[];
  placement?: "header" | "footer";
  // Shown only on pages in this language; empty = every language.
  locale?: string;
}
export interface Media {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  size: number;
  mime: string;
  alt: string;
}
export interface Brand {
  name: string;
  logo: string;
  footerLogo: string;
  primary: string;
  secondary: string;
  alternative: string;
}
export interface Layout {
  header: Section;
  footer: Section;
  headerMenus: string[];
  footerMenus: string[];
  homePageId: string;
  // Per-language header/footer text overrides, merged over the default values.
  localized?: Record<
    string,
    { header?: Record<string, string>; footer?: Record<string, string> }
  >;
}
export interface Project {
  revision: number;
  pages: CmsPage[];
  media: Media[];
  menus: Menu[];
  layout: Layout;
  brand: Brand;
  forms?: FormSettings;
  website?: WebsiteSettings;
  // Per-website stylesheet written by the design team (designer pack): same blocks,
  // unique look. Applied inside .site-canvas on public pages and previews.
  customCss?: string;
  // Font pair id from lib/builder/font-pairs.ts; set by the design team.
  fonts?: string;
  // Style preset values (radius, spacing, button shape, surface/muted colours); see style-presets.ts.
  style?: SiteStyle;
  // Multilingual website: default language has unprefixed URLs, the others
  // live under /site/{key}/{locale}/{slug}. Absent = single-language website.
  languages?: Languages;
  // Website-wide SEO: business details for structured data, verification tags,
  // redirects from old addresses (lib/builder/seo). Design roles only.
  seo?: SiteSeo;
}
export interface SiteSeo {
  business?: SeoBusiness;
  verification?: { google?: string; bing?: string };
  redirects?: SeoRedirect[];
  // Whole website out of search engines (test/demo websites, before launch).
  hideSite?: boolean;
  // Disallow AI crawlers that only collect training data (GPTBot, ClaudeBot, …); answer/search bots stay allowed.
  blockAiTraining?: boolean;
}
export interface SeoBusiness {
  // schema.org type: Organization, LocalBusiness or a LocalBusiness subtype.
  type: string;
  name: string;
  legalName: string;
  description: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  // One rule per line: "Mo-Fr 09:00-18:00", "Sa 10:00-14:00".
  hours: string;
  lat: string;
  lng: string;
  logo: string;
  priceRange: string;
  // Profile links (Facebook, Instagram, …), one per line.
  sameAs: string;
}
export interface SeoRedirect {
  id: string;
  // Old path, e.g. "/lv/par-uznemumu/" (query and trailing slash ignored).
  from: string;
  // A page id (follows slug changes) or a path/URL.
  to: string;
}
export interface Languages {
  default: string;
  enabled: string[];
}
export interface WebsiteSettings {
  url: string;
  contactEmail: string;
  phone: string;
  address: string;
  timeZone: string;
}
export interface FormSettings {
  recipient: string;
  successMessage: string;
  // Success message per page language (multilingual websites); falls back to successMessage.
  messages?: Record<string, string>;
  enabled: boolean;
}
