import type { MetadataRoute } from "next";
import { readProject } from "@/lib/builder/server";
import { publicProject } from "@/lib/builder/workflows";
import { siteOrigin } from "@/lib/builder/seo";
import { listProducts } from "@/lib/shop/products";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const project = publicProject(await readProject()),
    origin = siteOrigin(project);
  if (!origin) return [];
  const entries: MetadataRoute.Sitemap = project.pages
    .filter((p) => !p.seo.noindex)
    .map((p) => ({
      url: new URL(`/site/${p.slug}`, origin).href,
      ...(Number.isFinite(Date.parse(p.updatedAt))
        ? { lastModified: p.updatedAt }
        : {}),
    }));
  for (const service of project.services || []) entries.push({url:new URL(`/site/services/${service.slug}`,origin).href});
  if (project.store?.enabled && project.store.catalog?.enabled) {
    entries.push({ url: new URL("/site/catalog", origin).href });
    for (const p of await listProducts())
      if (p.status === "Published")
        entries.push({
          url: new URL(`/site/catalog/${p.slug}`, origin).href,
          ...(Number.isFinite(Date.parse(p.updatedAt))
            ? { lastModified: p.updatedAt }
            : {}),
        });
  }
  return entries;
}
