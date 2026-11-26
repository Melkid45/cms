import "server-only";
import { readCommerceSettings } from "../commerce-store";
import { currencySymbol } from "../commerce-settings";
import { readProject } from "../server";
import { readRegistry } from "../sites";
import { publicProject } from "../workflows";
import type { Project } from "../types";
import { applyCatalog, keepCatalogInfo } from "./apply";
import { readCatalog } from "./store";

// The website as visitors (and the checkout) see it: stored pages + the product catalogue
// (products/apply.ts). Same shape as readProject(); use it wherever published pages are read
// for the public website.
export async function readSiteProject(
  siteId: string,
  siteKey?: string,
): Promise<Project> {
  const [project, catalog, key, commerce] = await Promise.all([
    readProject(siteId),
    readCatalog(siteId),
    siteKey ??
      readRegistry().then(
        (r) => r.sites.find((s) => s.id === siteId)?.key ?? "",
      ),
    readCommerceSettings(siteId),
  ]);
  if (commerce.revision > 0)
    catalog.settings = {
      ...catalog.settings,
      priceFormat: `{n} ${currencySymbol(commerce.currency)}`,
    };
  const applied = applyCatalog(project, catalog, key);
  const { notifications: _private, ...publicSettings } = commerce;
  void _private;
  return keepCatalogInfo(applied, {
    ...applied,
    commerce: {
      ...publicSettings,
      notifications: {
        recipient: "",
        buyerConfirmation: commerce.notifications.buyerConfirmation,
      },
    },
  });
}
// publicProject() of the above.
export async function readPublicProject(
  siteId: string,
  siteKey?: string,
): Promise<Project> {
  const project = await readSiteProject(siteId, siteKey);
  return keepCatalogInfo(project, publicProject(project));
}
