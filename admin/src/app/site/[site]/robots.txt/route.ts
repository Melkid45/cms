import { readProject, StoreError } from "@/lib/builder/server";
import { siteByKey } from "@/lib/builder/sites";
import { siteSuspended } from "@/lib/builder/billing";
import { siteAddress } from "@/lib/builder/seo/server";
import { aiRobotsRules } from "@/lib/builder/seo/ai";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /site/{key}/robots.txt. Crawlers read robots.txt only at a host root: this file is what
// the website's own domain will serve at /robots.txt once a domain is attached (see
// BUILDER.md → SEO). On the shared CMS host, /robots.txt (app/robots.ts) lists every sitemap.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ site: string }> },
) {
  const { site: key } = await params;
  const site = await siteByKey(key);
  if (!site) return new Response("Not found", { status: 404 });
  let hidden = await siteSuspended(site.id);
  let ai = "";
  let prefix = `/site/${site.key}/`;
  let sitemap = "";
  try {
    const project = await readProject(site.id);
    // Only the production address is crawlable (not tunnel / local / admin host copies).
    const address = await siteAddress(site, project, request.headers);
    hidden ||= !!project.seo?.hideSite || !address.live;
    // On the website's own domain this file is /robots.txt and covers the whole host.
    if (address.onDomain) prefix = "/";
    ai = aiRobotsRules(project, prefix);
    sitemap = address.absolute(`/site/${site.key}/sitemap.xml`);
  } catch (error) {
    if (error instanceof StoreError && error.status === 404)
      return new Response("Not found", { status: 404 });
    throw error;
  }
  const body = hidden
    ? `User-agent: *\nDisallow: ${prefix}\n`
    : `User-agent: *\nAllow: ${prefix}\n\n${ai}\nSitemap: ${sitemap}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
