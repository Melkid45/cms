import { notFound, redirect } from "next/navigation";
import { readProject, StoreError } from "@/lib/builder/server";
import { primarySite, readRegistry } from "@/lib/builder/sites";
import { sitePath } from "@/lib/builder/site-links";
import { publicProject } from "@/lib/builder/workflows";
import { siteSuspended } from "@/lib/builder/billing";
import { SuspendedNotice, suspendedMetadata } from "./suspended";
import { headers } from "next/headers";
import { DOMAIN_HEADER, SITE_HEADER } from "@/lib/builder/domains/names";
import { PublicPageView, publicMetadata } from "./public-page";

// "/" of a connected domain (src/proxy.ts rewrites it here): the home page itself, no redirect.
async function domainHome(value: string) {
  const h = await headers();
  if (h.get(SITE_HEADER) !== value || !h.get(DOMAIN_HEADER)) return null;
  const site = (await readRegistry()).sites.find((item) => item.key === value);
  if (!site || (await siteSuspended(site.id))) return null;
  const project = await published(site.id);
  return project?.pages.find((p) => p.id === project.layout.homePageId) ?? null;
}
export const dynamic = "force-dynamic";
// Only reached for a switched-off website; other cases redirect or 404.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: value } = await params;
  const home = await domainHome(value);
  if (home) return publicMetadata(value, null, home.slug);
  const site = (await readRegistry()).sites.find((item) => item.key === value);
  return site && (await siteSuspended(site.id)) ? suspendedMetadata : {};
}
// A registry entry without its document is a missing website, not a server error.
async function published(siteId: string) {
  try {
    return publicProject(await readProject(siteId));
  } catch (error) {
    if (error instanceof StoreError && error.status === 404) return null;
    throw error;
  }
}
// One-segment URLs: /site/{site-key} opens that website's home page, and legacy
// /site/{slug} links of the first website keep working. Keys win; new keys cannot
// take the address of an existing page of the first website.
export default async function LegacyPublicPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: value } = await params;
  const home = await domainHome(value);
  if (home) return <PublicPageView siteKey={value} lang={null} slug={home.slug} root />;
  const registry = await readRegistry();
  const site = registry.sites.find((item) => item.key === value);
  if (site) {
    if (await siteSuspended(site.id)) return <SuspendedNotice />;
    const project = await published(site.id);
    const home = project?.pages.find((p) => p.id === project.layout.homePageId);
    if (home) redirect(sitePath(site.key, home.slug));
  }
  const primary = primarySite(registry);
  if (primary && primary !== site) {
    const project = await published(primary.id);
    if (project?.pages.some((p) => p.slug === value))
      redirect(sitePath(primary.key, value));
  }
  notFound();
}
