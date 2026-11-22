import { cache } from "react";
import { fontPreloads } from "@/lib/builder/font-preload";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { StoreError } from "@/lib/builder/server";
import { readPublicProject } from "@/lib/builder/products/public";
import { catalogProductOf } from "@/lib/builder/products/apply";
import { siteByKey } from "@/lib/builder/sites";
import {
  SiteCanvasMarkup,
  canvasRootProps,
  cartLookOf,
  checkoutTarget,
} from "@/components/builder/site-canvas-markup";
import { SiteRuntime } from "@/components/builder/site-runtime";
import { SiteAnalytics } from "@/components/builder/site-analytics";
import { siteSuspended } from "@/lib/builder/billing";
import {
  isLocale,
  languageHome,
  pageHref,
  pagePrefix,
  siteLanguages,
  translationsOf,
} from "@/lib/builder/i18n";
import { SuspendedNotice, suspendedMetadata } from "./suspended";
import { matchRedirect } from "@/lib/builder/seo/redirects";
import { pageContent } from "@/lib/builder/seo/content";
import { jsonLdString, structuredData } from "@/lib/builder/seo/jsonld";
import { ogPath, siteAddress } from "@/lib/builder/seo/server";
import { seoPack } from "@/lib/builder/seo/pack";
import { siteCssHref } from "@/lib/builder/site-css";

// Metadata and the page share one storage read per request.
export const website = cache(async (key: string) => {
  const site = await siteByKey(key);
  if (!site) return null;
  // A website switched off for non-payment shows only a notice, whatever the page.
  if (await siteSuspended(site.id)) return "suspended" as const;
  try {
    // Stored pages + the product catalogue (lib/builder/products).
    return { site, project: await readPublicProject(site.id, site.key) };
  } catch (error) {
    // A registry entry without its document is a missing website, not a server error.
    if (error instanceof StoreError && error.status === 404) return null;
    throw error;
  }
});

// Resolves /site/{key}/{slug} (lang = null) and /site/{key}/{lang}/{slug}.
// A page is served only under its own language prefix (none for the default
// language); any other combination redirects to the page's real address.
// /site/{key}/{lang} opens that language's home page.
type Website = Exclude<Awaited<ReturnType<typeof website>>, null | "suspended">;
type Loaded =
  | null
  | "suspended"
  | { redirect: string; permanent?: boolean }
  | (Website & { page: Website["project"]["pages"][number] });
async function load(
  key: string,
  lang: string | null,
  slug: string,
): Promise<Loaded> {
  const found = await website(key);
  if (!found || found === "suspended") return found;
  const { site, project } = found;
  const languages = siteLanguages(project);
  const page = project.pages.find(
    (p) => p.slug === slug && p.status === "Published",
  );
  // Redirect list (Settings → SEO): old addresses of a moved website, permanent.
  const moved = (!page || (lang ?? "") !== pagePrefix(languages, page.locale)) &&
    matchRedirect(project, site.key, lang ? `/${lang}/${slug}` : `/${slug}`);
  if (moved) return { redirect: moved, permanent: true };
  if (!page) {
    if (lang === null && languages?.enabled.includes(slug) && isLocale(slug)) {
      const home = languageHome(project, slug);
      if (home) return { redirect: pageHref(project, site.key, home) };
    }
    return null;
  }
  const prefix = pagePrefix(languages, page.locale);
  if ((lang ?? "") !== prefix)
    return { redirect: pageHref(project, site.key, page) };
  return { site, project, page };
}

// Redirect for a path that no page route matches (deeper old URLs, non-language prefixes).
export async function redirectFor(key: string, path: string) {
  const found = await website(key);
  if (!found || found === "suspended") return null;
  const target = matchRedirect(found.project, found.site.key, path);
  // On a connected domain the target loses its /site/{key} prefix.
  return target && (await siteAddress(found.site, found.project, await headers())).link(target);
}

export async function publicMetadata(
  key: string,
  lang: string | null,
  slug: string,
): Promise<Metadata> {
  const found = await load(key, lang, slug);
  if (found === "suspended") return suspendedMetadata;
  if (!found || "redirect" in found) return { title: "Page not found" };
  const { site, project, page } = found;
  // Absolute URLs: the connected domain, else the Website URL setting, else NEXT_PUBLIC_SITE_URL,
  // else this request's host (lib/builder/seo/server.ts → siteAddress).
  const address = await siteAddress(site, project, await headers());
  const base = address.base;
  // Not the website's production address (tunnel, local, admin host): never indexed.
  const live = address.live && !project.seo?.hideSite;
  const absolute = address.absolute;
  const ogTitle = page.seo.ogTitle || page.seo.title || page.title;
  const ogDescription = page.seo.ogDescription || page.seo.description;
  const verification = project.seo?.verification;
  // No own image: automatic card with the SEO pack, else the page's first (hero) image.
  const hero = page.seo.image ? "" : pageContent(page.sections).heroImage;
  const autoOg = !page.seo.image && (await seoPack(site.id));
  const languages = siteLanguages(project);
  // hreflang links to every published translation, x-default = default language.
  const alternates = languages
    ? translationsOf(project.pages, page).filter((p) =>
        languages.enabled.includes(p.locale),
      )
    : [];
  const fallback = alternates.find((p) => p.locale === languages?.default);
  return {
    metadataBase: new URL(base),
    title: { absolute: page.seo.title || page.title },
    description: page.seo.description,
    keywords: page.seo.keywords,
    alternates: {
      canonical: page.seo.canonical || absolute(pageHref(project, site.key, page)),
      ...(alternates.length > 1
        ? {
            languages: {
              ...Object.fromEntries(
                alternates.map((p) => [
                  p.locale,
                  absolute(pageHref(project, site.key, p)),
                ]),
              ),
              ...(fallback
                ? {
                    "x-default": absolute(
                      pageHref(project, site.key, fallback),
                    ),
                  }
                : {}),
            },
          }
        : {}),
    },
    robots: {
      index: live && !page.seo.noindex,
      follow: live,
    },
    ...(verification?.google || verification?.bing
      ? {
          verification: {
            ...(verification.google ? { google: verification.google } : {}),
            ...(verification.bing
              ? { other: { "msvalidate.01": verification.bing } }
              : {}),
          },
        }
      : {}),
    openGraph: {
      type: "website",
      url: absolute(pageHref(project, site.key, page)),
      siteName: project.brand.name,
      title: ogTitle,
      description: ogDescription,
      // Automatic 1200×630 card (hero image + title): lib/builder/seo/server.ts.
      images: page.seo.image
        ? [absolute(page.seo.image)]
        : autoOg
          ? [{ url: absolute(ogPath(site.id, page)), width: 1200, height: 630, alt: ogTitle }]
          : hero
            ? [absolute(hero)]
            : [],
      ...(languages ? { locale: page.locale } : {}),
    },
    twitter: { card: "summary_large_image", title: ogTitle, description: ogDescription },
  };
}

export async function PublicPageView({
  siteKey,
  lang,
  slug,
  root = false,
}: {
  siteKey: string;
  lang: string | null;
  slug: string;
  // Rendered at "/" of a connected domain (the home page).
  root?: boolean;
}) {
  const found = await load(siteKey, lang, slug);
  if (found === "suspended") return <SuspendedNotice />;
  if (!found) notFound();
  const requestHeaders = await headers();
  const loaded = found === null || "redirect" in found ? null : found;
  const owner = loaded ?? (await website(siteKey));
  const address =
    owner && owner !== "suspended"
      ? await siteAddress(owner.site, owner.project, requestHeaders)
      : null;
  const link = address ? address.link : (href: string) => href;
  if ("redirect" in found)
    return found.permanent
      ? permanentRedirect(link(found.redirect))
      : redirect(link(found.redirect));
  const { site, project, page } = found;
  // On the domain the home page lives at "/": /home redirects there.
  if (address?.onDomain && !root && link(pageHref(project, site.key, page)) === "/")
    permanentRedirect("/");
  const checkout = checkoutTarget(project, page.locale);
  // Library CSS of the blocks on this page only, in site.scss order (lib/builder/site-css.ts).
  const cssHref = siteCssHref([
    project.layout.header,
    ...page.sections,
    project.layout.footer,
  ]);
  const jsonLd = structuredData(
    project,
    site.key,
    page,
    pageContent(page.sections),
    address!.absolute,
  );
  // Catalogue product page: Offer availability from the product's stock.
  const product = catalogProductOf(project, page.id);
  if (product)
    for (const node of jsonLd["@graph"])
      if (node["@type"] === "Product" && node.offers && typeof node.offers === "object")
        (node.offers as Record<string, unknown>).availability = `https://schema.org/${
          product.stock === "in_stock" ? "InStock" : product.stock === "to_order" ? "PreOrder" : "OutOfStock"
        }`;
  return (
    <>
      {/* One stylesheet; React hoists it into <head> after the layout CSS. */}
      <link rel="stylesheet" href={cssHref} precedence="site-css" />
      {/* Only this website's font pair, only the subsets of the page language (site-fonts.css). */}
      {fontPreloads(project.fonts, page.locale || project.languages?.default).map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      {/* Markup rendered here on the server; the browser gets only the runtime (behaviours). */}
      <SiteRuntime
        rootProps={canvasRootProps(project, page.locale)}
        options={{
          siteId: site.id,
          pageId: page.id,
          locale: page.locale,
          lang: page.locale || project.languages?.default,
          formsOff: project.forms?.enabled === false,
          checkout: checkout && {
            id: checkout.id,
            href: link(pageHref(project, site.key, checkout)),
          },
          cartLook: cartLookOf(project),
        }}
      >
        <SiteCanvasMarkup
          project={project}
          sections={page.sections}
          pageId={page.id}
          siteKey={site.key}
          siteId={site.id}
          locale={page.locale}
          rootLinks={address?.onDomain}
        />
      </SiteRuntime>
      <SiteAnalytics siteId={site.id} pageId={page.id} />
    </>
  );
}
