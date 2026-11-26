import "server-only";
import { createHmac } from "node:crypto";
import { readProject } from "../server";
import { readRegistry } from "../sites";
import { publicProject } from "../workflows";
import { pageHref } from "../i18n";
import { absoluteWith } from "./server";
import { primaryDomain } from "../domains/store";
import { rootedHref } from "../domains/names";

// IndexNow (free, indexnow.org): tells Bing (and Yandex, Seznam, Naver) about a published
// page right away; Bing's index also feeds ChatGPT search. The key is derived per website
// from the server secret and served at /site/{key}/indexnow.txt (keyLocation), which
// covers every URL under /site/{key}/.
export function indexNowKey(siteId: string) {
  return createHmac("sha256", process.env.CMS_AUTH_SECRET || "harbstone-local-indexnow")
    .update("indexnow:" + siteId)
    .digest("hex")
    .slice(0, 32);
}
// Pings only for a real public address: the website URL setting is an https domain and the
// server runs in production (never from local / tunnel development).
export function indexNowBase(url: string | undefined) {
  if (!url || process.env.NODE_ENV !== "production") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || /localhost|trycloudflare\.com$|^127\./.test(parsed.hostname))
      return null;
    return parsed;
  } catch {
    return null;
  }
}
export async function pingIndexNow(siteId: string, pageId: string) {
  try {
    const project = publicProject(await readProject(siteId));
    // A connected custom domain is the public address (BUILDER.md → Custom domains).
    const domain = await primaryDomain(siteId);
    const base = indexNowBase(domain ? `https://${domain}` : project.website?.url);
    const site = (await readRegistry()).sites.find((s) => s.id === siteId);
    const page = project.pages.find((p) => p.id === pageId);
    if (!base || !site || !page || page.seo.noindex || project.seo?.hideSite) return;
    const absolute = (href: string) =>
      absoluteWith(base.origin)(domain ? rootedHref(project, site.key, href) : href);
    // The page and its published translations.
    const urls = project.pages
      .filter((p) => p.id === page.id || (page.translationGroup && p.translationGroup === page.translationGroup))
      .filter((p) => !p.seo.noindex)
      .map((p) => absolute(pageHref(project, site.key, p)));
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: base.host,
        key: indexNowKey(siteId),
        keyLocation: absolute(`/site/${site.key}/indexnow.txt`),
        urlList: urls,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Best effort: the sitemap still lists the page.
  }
}
