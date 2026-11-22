import "server-only";
import { readProject } from "../server";
import { readRegistry } from "../sites";
import { publicProject } from "../workflows";
import type { Project } from "../types";
import { applyCatalog, keepCatalogInfo } from "./apply";
import { readCatalog } from "./store";

// The website as visitors (and the checkout) see it: stored pages + the product catalogue
// (products/apply.ts). Same shape as readProject(); use it wherever published pages are read
// for the public website.
export async function readSiteProject(siteId: string, siteKey?: string): Promise<Project> {
  const [project, catalog, key] = await Promise.all([
    readProject(siteId),
    readCatalog(siteId),
    siteKey ?? readRegistry().then((r) => r.sites.find((s) => s.id === siteId)?.key ?? ""),
  ]);
  return applyCatalog(project, catalog, key);
}
// publicProject() of the above.
export async function readPublicProject(siteId: string, siteKey?: string): Promise<Project> {
  const project = await readSiteProject(siteId, siteKey);
  return keepCatalogInfo(project, publicProject(project));
}
