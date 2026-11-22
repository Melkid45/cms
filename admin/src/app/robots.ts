import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { readProject } from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import { siteSuspended } from "@/lib/builder/billing";
import { siteAddress } from "@/lib/builder/seo/server";
import { AI_TRAINING_BOTS } from "@/lib/builder/seo/ai";

// robots.txt of the shared CMS host: admin screens stay out, every website's sitemap is
// listed (websites hidden in Settings → SEO or suspended are disallowed instead). Websites
// with "Block AI training" get a group for the training-only crawlers. A crawler that matches
// its own group ignores the "*" group, so that group repeats the common rules.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const registry = await readRegistry();
  const disallow = ["/dashboard", "/login", "/api/builder", "/order"];
  const noTraining: string[] = [];
  const sitemap: string[] = [];
  for (const site of registry.sites) {
    try {
      const project = await readProject(site.id);
      const address = await siteAddress(site, project, requestHeaders);
      // Websites are crawlable only on their own production address (domain / Website URL host).
      if (
        project.seo?.hideSite ||
        !address.live ||
        (await siteSuspended(site.id))
      ) {
        disallow.push(`/site/${site.key}/`);
        continue;
      }
      if (project.seo?.blockAiTraining) noTraining.push(`/site/${site.key}/`);
      sitemap.push(address.absolute(`/site/${site.key}/sitemap.xml`));
    } catch {
      // a registry entry without its document has no pages
    }
  }
  const rules: MetadataRoute.Robots["rules"] = [{ userAgent: "*", allow: "/", disallow }];
  if (noTraining.length)
    rules.push({
      userAgent: AI_TRAINING_BOTS.map((b) => b.token),
      allow: "/",
      disallow: [...disallow, ...noTraining],
    });
  return { rules, sitemap };
}
