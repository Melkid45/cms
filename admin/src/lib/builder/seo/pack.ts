import "server-only";
import { withDoc } from "../doc-store";
import { readBilling } from "../billing";

// SEO pack (paid monthly package, per website): advanced audit details, AI readiness,
// automatic OG images, llms.txt and redirect suggestions. Basic meta fields, sitemap,
// robots.txt, JSON-LD and the manual redirect list work on every website.
// Enabled when the owner switches it on (SEO screen, super admin) or when the website has
// the billing module with id "seo-pack" (Billing → modules).
type PackDoc = { sites: string[] };
const doc = <T>(fn: (data: PackDoc) => T, write = false) =>
  withDoc<PackDoc, T>("seo-pack", () => ({ sites: [] }), fn, write);

export async function seoPack(siteId: string) {
  if (await doc((d) => d.sites.includes(siteId)).catch(() => false)) return true;
  try {
    const billing = await readBilling();
    return !!billing.siteAddons?.some((a) => a.siteId === siteId && a.addonId === "seo-pack");
  } catch {
    return false;
  }
}
export const setSeoPack = (siteId: string, enabled: boolean) =>
  doc((d) => {
    d.sites = d.sites.filter((s) => s !== siteId);
    if (enabled) d.sites.push(siteId);
    return enabled;
  }, true);
