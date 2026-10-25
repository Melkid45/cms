import { blockDefinitions, createContent, type BlockContent } from "./cms-library";

export interface PageBlock {
  key: string;
  family: string;
  variant: string;
  source: string;
  content?: BlockContent;
}

export interface PageSeo {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogImageAlt: string;
  ogType: "website" | "article";
  index: boolean;
  follow: boolean;
}

export const defaultPageSeo: PageSeo = { title: "", description: "", keywords: "", canonical: "", ogTitle: "", ogDescription: "", ogImage: "", ogImageAlt: "", ogType: "website", index: true, follow: true };

export interface ExamplePage {
  title: string;
  slug: string;
  locale: string;
  status: "Draft" | "Published";
  updated: string;
  blocks: PageBlock[];
  seo?: PageSeo;
}

function sections(...sources: string[]): PageBlock[] {
  return sources.map((source, index) => {
    const [family, file] = source.split("/");
    const version = file.match(/-v(\d+)/)?.[1];
    return { key: `${source}-${index}`, family: family.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "), variant: version ? `Variation ${version}` : "Default", source };
  });
}

export const examplePages: ExamplePage[] = [
  { title: "Studio demo", slug: "studio", locale: "en", status: "Draft", updated: "Demo", blocks: ["about-editorial", "services-editorial", "photo-profile", "column-text-grid", "text-numbers-strip"].map((id, index) => { const definition = blockDefinitions.find((item) => item.id === id)!; return { key: `studio-${index}`, family: definition.family, variant: definition.label, source: `cms/${id}`, content: createContent(`cms/${id}`) }; }) },
  { title: "Home", slug: "home", locale: "en", status: "Published", updated: "8 minutes ago", blocks: sections("hero/hero.html", "partners/partners.html", "about/about.html", "services/services.html", "advantages/advantages.html", "testimonials/testimonials.html", "price/price.html", "cta/cta.html") },
  { title: "About", slug: "about", locale: "en", status: "Published", updated: "September 17", blocks: sections("intro/intro.html", "about/about-v2.html", "text-numbers/text-numbers.html", "team/team.html", "timeline/timeline.html") },
  { title: "Services", slug: "services", locale: "en", status: "Published", updated: "September 15", blocks: sections("hero/hero.html", "services/services-v2.html", "column-text/column-text.html", "advantages/advantages.html", "price/price.html", "faq/faq.html", "cta/cta.html") },
  { title: "Projects", slug: "projects", locale: "en", status: "Draft", updated: "Today, 10:18", blocks: sections("intro/intro.html", "gallery/gallery-v2.html", "photo/photo.html", "cta/cta.html") },
  { title: "Contacts", slug: "contacts", locale: "en", status: "Published", updated: "September 2", blocks: sections("intro/intro.html", "column-text/column-text.html", "cta/cta.html") },
];
