import type { MetadataRoute } from "next";
import { readProject } from "@/lib/builder/server";
import { privatePaths, siteOrigin } from "@/lib/builder/seo";
export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = siteOrigin(await readProject());
  return {
    rules: { userAgent: "*", allow: "/", disallow: privatePaths },
    ...(origin ? { sitemap: new URL("/sitemap.xml", origin).href } : {}),
  };
}
