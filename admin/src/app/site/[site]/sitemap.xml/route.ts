import { StoreError } from "@/lib/builder/server";
import { siteByKey } from "@/lib/builder/sites";
import { siteSuspended } from "@/lib/builder/billing";
import { readPublicProject } from "@/lib/builder/products/public";
import { NOINDEX_HEADERS, siteAddress, sitemapEntries } from "@/lib/builder/seo/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const xml = (value: string) =>
  value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

// /site/{key}/sitemap.xml: every published, indexable page in every language, with
// xhtml:link hreflang alternates and lastmod = publish time.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ site: string }> },
) {
  const { site: key } = await params;
  const site = await siteByKey(key);
  if (!site || (await siteSuspended(site.id)))
    return new Response("Not found", { status: 404 });
  let project;
  try {
    // Catalogue product pages included (lib/builder/products).
    project = await readPublicProject(site.id, site.key);
  } catch (error) {
    if (error instanceof StoreError && error.status === 404)
      return new Response("Not found", { status: 404 });
    throw error;
  }
  // Connected domain: https://{domain}/… without /site/{key} (BUILDER.md → Custom domains).
  const address = await siteAddress(site, project, request.headers);
  const absolute = address.absolute;
  const entries = project.seo?.hideSite ? [] : sitemapEntries(project, site.key, absolute);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .map(
    (e) => `  <url>
    <loc>${xml(e.loc)}</loc>
${e.alternates.map((a) => `    <xhtml:link rel="alternate" hreflang="${xml(a.lang)}" href="${xml(a.href)}"/>\n`).join("")}${e.lastmod ? `    <lastmod>${xml(new Date(e.lastmod).toISOString())}</lastmod>\n` : ""}    <priority>${e.home ? "1.0" : "0.7"}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...(address.live ? {} : NOINDEX_HEADERS),
    },
  });
}
