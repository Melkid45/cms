export type FieldType = "heading" | "textarea" | "text" | "url" | "image";
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
  id: string;
  variant: string;
  values: Record<string, string>;
  hidden?: boolean;
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
  published?: PageSnapshot;
  history?: PageVersion[];
  deletedAt?: string;
  id: string;
  title: string;
  slug: string;
  locale: string;
  status: "Draft" | "Published";
  sections: Section[];
  seo: {
    title: string;
    description: string;
    keywords: string;
    image: string;
    noindex: boolean;
  };
  updatedAt: string;
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
}
export interface Project {
  revision: number;
  pages: CmsPage[];
  media: Media[];
  menus: Menu[];
  layout: Layout;
  brand: Brand;
  forms?: FormSettings;
}
export interface FormSettings {
  recipient: string;
  successMessage: string;
  enabled: boolean;
}
