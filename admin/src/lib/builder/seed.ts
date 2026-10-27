import { createSection, definitions } from "./catalog";
import type { CmsPage, Project } from "./types";
function page(slug: string, title: string, variants: string[]): CmsPage {
  const sections = variants.map((variant, index) =>
    createSection(variant, `${slug}-${index}`),
  );
  sections.forEach((section) => {
    const d = definitions.find((d) => d.id === section.variant)!;
    for (const f of d.fields) {
      if (f.type === "url") {
        const url = section.values[f.key];
        if (url.startsWith("/"))
          section.values[f.key] = url.includes("services")
            ? "/site/services"
            : "/site/studio";
        if (url.startsWith("#hero")) section.values[f.key] = "/site/services";
      }
      if (section.values[f.key] === "Explore another layout")
        section.values[f.key] = "Explore our services";
    }
  });
  return {
    id: slug,
    slug,
    title,
    locale: "en",
    status: "Published",
    sections,
    seo: {
      title: `${title} — Northline Studio`,
      description:
        "Considered interiors for everyday life. An independent design studio.",
      keywords: "interior design, studio, workspace",
      image: "/images/hero/workspace.jpg",
      noindex: false,
    },
    updatedAt: "2026-10-27T00:00:00.000Z",
  };
}
export function seedProject(): Project {
  const pages = [
    page("home", "Home", [
      "hero-v2",
      "about-v1",
      "services-v2",
      "advantages-v3",
      "testimonials-v1",
      "faq-v1",
      "contact-v3",
    ]),
    page("studio", "Studio", [
      "hero-v3",
      "about-v3",
      "content-v1",
      "gallery-v2",
      "contact-v6",
    ]),
    page("services", "Services", [
      "hero-v6",
      "services-v6",
      "process-v5",
      "pricing-v5",
      "faq-v4",
      "contact-v7",
    ]),
  ];
  const updateHeading = (page: CmsPage, text: string) => {
    const section = page.sections[0];
    const field = definitions
      .find((d) => d.id === section.variant)!
      .fields.find((f) => f.type === "heading");
    if (field) section.values[field.key] = text;
  };
  updateHeading(pages[0], "A better place\nto feel at home.");
  updateHeading(pages[1], "A small studio.\nA considered approach.");
  updateHeading(pages[2], "From a first idea\nto the final detail.");
  const images = [
    ...new Set(
      definitions
        .flatMap((d) =>
          d.fields.filter((f) => f.type === "image").map((f) => f.value),
        )
        .filter((url) => url.startsWith("/images/")),
    ),
  ];
  return {
    revision: 0,
    pages,
    media: images.map((url, index) => ({
      id: `stock-${index}`,
      name: url.split("/").at(-1)!,
      url,
      width: 1600,
      height: 1067,
      size: 0,
      mime: "image/jpeg",
      alt: url
        .split("/")
        .at(-1)!
        .replaceAll("-", " ")
        .replace(/\.[^.]+$/, ""),
    })),
    menus: [
      {
        id: "main",
        title: "Explore",
        placement: "header",
        items: pages.map((p) => ({
          id: `nav-${p.id}`,
          label: p.title,
          pageId: p.id,
          url: "",
          children: [],
        })),
      },
      {
        id: "footer-main",
        title: "Explore",
        placement: "footer",
        items: pages.map((p) => ({
          id: `footer-nav-${p.id}`,
          label: p.title,
          pageId: p.id,
          url: "",
          children: [],
        })),
      },
      {
        id: "footer-contact",
        title: "Practice",
        placement: "footer",
        items: [
          {
            id: "studio-practice",
            label: "Our studio",
            pageId: "studio",
            url: "",
            children: [],
          },
          {
            id: "services-practice",
            label: "Design services",
            pageId: "services",
            url: "",
            children: [],
          },
        ],
      },
    ],
    layout: {
      header: createSection("header-v1", "site-header"),
      footer: createSection("footer-v2", "site-footer"),
      headerMenus: ["main"],
      footerMenus: ["footer-main", "footer-contact"],
      homePageId: "home",
    },
    brand: {
      name: "Northline Studio",
      logo: "",
      footerLogo: "",
      primary: "#252720",
      secondary: "#fafbf7",
      alternative: "#dce7bb",
    },
  };
}
