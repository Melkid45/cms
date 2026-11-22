import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { connectedContent } from "@/lib/builder/inline-content";
import { pageHref } from "@/lib/builder/i18n";
import { siteAddress } from "@/lib/builder/seo/server";
import { siteCssHref } from "@/lib/builder/site-css";
import { fontPreloads } from "@/lib/builder/font-preload";
import {
  SiteCanvasMarkup,
  canvasRootProps,
  cartLookOf,
  checkoutTarget,
} from "@/components/builder/site-canvas-markup";
import { SiteRuntime } from "@/components/builder/site-runtime";
import { ServiceArticle } from "@/components/builder/service-page";
import { SuspendedNotice, suspendedMetadata } from "./suspended";
import { website } from "./public-page";

// Standalone service pages: /site/{key}/services/{slug} (button action "page" or "editorial",
// merged from origin/main where it was /site/services/{slug} of the only website). Handled by
// the [slug]/[page] route when the first segment is "services" and not a language.
async function loadService(key: string, slug: string) {
  const found = await website(key);
  if (!found || found === "suspended") return found;
  const project = connectedContent(found.project).project;
  const service = project.services?.find(
    (s) => s.slug === slug && s.status === "Published",
  );
  return service ? { ...found, project, service } : null;
}

export async function serviceMetadata(key: string, slug: string): Promise<Metadata | null> {
  const found = await loadService(key, slug);
  if (found === "suspended") return suspendedMetadata;
  if (!found) return null;
  return { title: found.service.title, description: found.service.summary };
}

export async function hasPublicService(key: string, slug: string) {
  return !!(await loadService(key, slug));
}

export async function PublicServiceView({ siteKey, slug }: { siteKey: string; slug: string }) {
  const found = await loadService(siteKey, slug);
  if (found === "suspended") return <SuspendedNotice />;
  if (!found) notFound();
  const { site, project, service } = found;
  const address = await siteAddress(site, project, await headers());
  const home =
    project.pages.find((p) => p.id === project.layout.homePageId) || project.pages[0];
  const locale = home?.locale || project.languages?.default;
  const checkout = checkoutTarget(project, locale);
  const cssHref = siteCssHref([project.layout.header, project.layout.footer]);
  return (
    <>
      <link rel="stylesheet" href={cssHref} precedence="site-css" />
      {fontPreloads(project.fonts, locale).map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
      ))}
      <SiteRuntime
        rootProps={canvasRootProps(project, locale)}
        options={{
          siteId: site.id,
          pageId: `service:${service.id}`,
          locale,
          lang: locale,
          formsOff: project.forms?.enabled === false,
          checkout: checkout && {
            id: checkout.id,
            href: address.link(pageHref(project, site.key, checkout)),
          },
          cartLook: cartLookOf(project),
        }}
      >
        <SiteCanvasMarkup
          project={project}
          sections={[]}
          pageId={home?.id}
          siteKey={site.key}
          siteId={site.id}
          locale={locale}
          rootLinks={address.onDomain}
        >
          <ServiceArticle
            project={project}
            service={service}
            homeHref={home ? address.link(pageHref(project, site.key, home)) : "/"}
            siteId={site.id}
            locale={locale}
          />
        </SiteCanvasMarkup>
      </SiteRuntime>
    </>
  );
}
