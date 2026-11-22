// Redirect list of a website (Settings → SEO → Redirects): old path → page or address.
// Client-safe. Paths are relative to the website root: "/lv/par-uznemumu" means
// /site/{key}/lv/par-uznemumu today and https://{domain}/lv/par-uznemumu once a domain is attached.
import { pageHref } from "../i18n";
import type { Project } from "../types";
import { normalizePath } from "./schema";

export function matchRedirect(
  project: Pick<Project, "seo" | "pages" | "languages">,
  siteKey: string,
  path: string,
): string | null {
  const from = normalizePath(path);
  const rule = project.seo?.redirects?.find((r) => r.from === from);
  if (!rule) return null;
  const page = project.pages.find((p) => p.id === rule.to && !p.deletedAt);
  let target: string;
  if (page) target = pageHref(project, siteKey, page);
  else if (/^[\w-]+$/.test(rule.to)) return null; // a page that is not published (any more)
  else target = rule.to.startsWith("/") && !rule.to.startsWith("/site/") ? `/site/${siteKey}${rule.to}` : rule.to;
  // Never redirect a path to itself.
  if (normalizePath(target) === normalizePath(`/site/${siteKey}${from}`)) return null;
  return target;
}
