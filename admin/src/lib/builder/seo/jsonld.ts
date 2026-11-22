// Structured data (schema.org JSON-LD) for a published page: the business
// (Organization / LocalBusiness), BreadcrumbList, Product + Offer for product pages and
// FAQPage for FAQ sections. Shapes follow schema.org and Google's structured data docs.
import { languageHome, pageHref } from "../i18n";
import type { MenuItem, Project } from "../types";
import type { PageContent } from "./content";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// "Mo-Fr 09:00-18:00" → OpeningHoursSpecification.
export function openingHours(value: string) {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [days, time] = line.split(" ");
      const [opens, closes] = (time || "").split("-");
      if (!opens || !closes) return [];
      const dayOfWeek = days.split(",").flatMap((part) => {
        const [a, b] = part.split("-").map((d) => DAYS.indexOf(d as (typeof DAYS)[number]));
        if (a < 0) return [];
        const end = b === undefined || b < 0 ? a : b;
        const out: string[] = [];
        for (let i = a; ; i = (i + 1) % 7) {
          out.push(DAY_NAMES[i]);
          if (i === end || out.length > 7) break;
        }
        return out;
      });
      return [{ "@type": "OpeningHoursSpecification", dayOfWeek, opens, closes }];
    });
}
// LocalBusiness subtypes offered in Settings → SEO (all are schema.org types).
export const BUSINESS_TYPES = [
  "Organization",
  "LocalBusiness",
  "Store",
  "ComputerStore",
  "FurnitureStore",
  "HomeAndConstructionBusiness",
  "HousePainter",
  "GeneralContractor",
  "ProfessionalService",
  "CleaningService" /* not a schema.org type: mapped below */,
  "Restaurant",
  "CafeOrCoffeeShop",
  "BeautySalon",
  "HairSalon",
  "Dentist",
  "AutoRepair",
  "LodgingBusiness",
  "SportsActivityLocation",
] as const;
// Types that are not in schema.org fall back to a valid parent.
const TYPE_ALIAS: Record<string, string> = { CleaningService: "ProfessionalService" };

const lines = (value = "") =>
  value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const clean = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) => v !== "" && v !== undefined && v !== null && !(Array.isArray(v) && !v.length),
    ),
  ) as T;

export function structuredData(
  project: Project,
  siteKey: string,
  page: { id: string; title: string; slug: string; locale: string; updatedAt?: string; seo: { title: string; description: string } },
  content: PageContent,
  absolute: (path: string) => string,
) {
  const graph: Record<string, unknown>[] = [];
  const b = project.seo?.business;
  const home = languageHome(project, page.locale) ?? project.pages.find((p) => p.id === project.layout.homePageId);
  const homeUrl = absolute(home ? pageHref(project, siteKey, home) : `/site/${siteKey}`);
  const type = TYPE_ALIAS[b?.type || ""] ?? (b?.type || "Organization");
  const local = type !== "Organization";
  const orgId = homeUrl + "#organization";
  const address = b
    ? clean({
        "@type": "PostalAddress",
        streetAddress: b.street,
        addressLocality: b.city,
        addressRegion: b.region,
        postalCode: b.postalCode,
        addressCountry: b.country,
      })
    : project.website?.address
      ? { "@type": "PostalAddress", streetAddress: project.website.address }
      : undefined;
  const logo = b?.logo || project.brand.logo;
  graph.push(
    clean({
      "@type": type,
      "@id": orgId,
      name: b?.name || project.brand.name,
      legalName: b?.legalName,
      description: b?.description,
      url: homeUrl,
      logo: logo ? absolute(logo) : undefined,
      image: local && logo ? absolute(logo) : undefined,
      telephone: b?.phone || project.website?.phone,
      email: b?.email || project.website?.contactEmail,
      address: address && Object.keys(address).length > 1 ? address : undefined,
      geo:
        local && b?.lat && b?.lng
          ? { "@type": "GeoCoordinates", latitude: Number(b.lat), longitude: Number(b.lng) }
          : undefined,
      openingHoursSpecification: local && b?.hours ? openingHours(b.hours) : undefined,
      priceRange: local ? b?.priceRange : undefined,
      sameAs: lines(b?.sameAs),
    }),
  );
  graph.push({
    "@type": "WebSite",
    "@id": homeUrl + "#website",
    url: homeUrl,
    name: project.brand.name,
    inLanguage: page.locale,
    publisher: { "@id": orgId },
  });

  // Breadcrumbs: home → menu parent (when the page sits under one) → page.
  const pageUrl = absolute(pageHref(project, siteKey, page));
  // The page itself with its last publish date (AI answers prefer dated sources).
  graph.push(
    clean({
      "@type": "WebPage",
      "@id": pageUrl + "#webpage",
      url: pageUrl,
      name: page.seo.title || page.title,
      description: page.seo.description,
      inLanguage: page.locale,
      isPartOf: { "@id": homeUrl + "#website" },
      about: { "@id": orgId },
      dateModified: page.updatedAt || undefined,
    }),
  );
  if (home && home.id !== page.id) {
    const trail: { name: string; url: string }[] = [{ name: home.title, url: homeUrl }];
    const parentOf = (items: MenuItem[], parent?: MenuItem): MenuItem | undefined | null => {
      for (const item of items) {
        if (item.pageId === page.id) return parent ?? null;
        const found = parentOf(item.children, item);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    for (const menu of project.menus) {
      const parent = parentOf(menu.items);
      const target = parent?.pageId && project.pages.find((p) => p.id === parent.pageId);
      if (parent === undefined) continue;
      if (target && target.id !== home.id)
        trail.push({ name: parent.label || target.title, url: absolute(pageHref(project, siteKey, target)) });
      break;
    }
    trail.push({ name: page.title, url: pageUrl });
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: trail.map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: t.name,
        item: t.url,
      })),
    });
  }

  for (const product of content.products) {
    if (Number.isNaN(product.price)) continue;
    graph.push(
      clean({
        "@type": "Product",
        name: product.name,
        description: product.description || page.seo.description,
        image: product.images.map(absolute),
        brand: { "@type": "Brand", name: project.brand.name },
        offers: clean({
          "@type": "Offer",
          url: pageUrl,
          price: product.price.toFixed(2),
          priceCurrency: product.currency,
          availability: product.availability ? `https://schema.org/${product.availability}` : undefined,
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@id": orgId },
        }),
      }),
    );
  }
  if (content.faqs.length)
    graph.push({
      "@type": "FAQPage",
      mainEntity: content.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  return { "@context": "https://schema.org", "@graph": graph };
}
// Safe inside <script>: no "</script>" or HTML comment openers.
export const jsonLdString = (data: unknown) =>
  JSON.stringify(data).replace(/</g, "\\u003c");
