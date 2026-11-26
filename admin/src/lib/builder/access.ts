// super-admin: everything. designer: builds and edits the design of assigned websites.
// client: content of assigned websites only.
export type Role = "super-admin" | "designer" | "client";
export const canDesign = (identity: Pick<Identity, "role">) =>
  identity.role === "super-admin" || identity.role === "designer";
// Companies/websites a client account may open. Super admins always see everything.
export interface AccessScope {
  companies: string[];
  sites: string[];
}
export interface Identity {
  id: string;
  email: string;
  name: string;
  role: Role;
  version: number;
  scope?: AccessScope;
}
// The first website keeps id "default"; clients created before multi-site support keep access to it.
export const legacySiteId = "default";
export const legacyScope = (): AccessScope => ({
  companies: [],
  sites: [legacySiteId],
});
export function canAccessSite(
  identity: Pick<Identity, "role" | "scope">,
  site: { id: string; companyId: string },
) {
  if (identity.role === "super-admin") return true;
  const scope = identity.scope ?? legacyScope();
  return (
    scope.sites.includes(site.id) || scope.companies.includes(site.companyId)
  );
}
// Screens a designer may open in addition to the client ones.
export function designerRoute(path: string) {
  return (
    (clientRoute(path) && !crmRoute(path) && path !== "/dashboard/shop/orders") ||
    path.startsWith("/dashboard/pages") ||
    path === "/dashboard/layout" ||
    path === "/dashboard/content" ||
    path === "/dashboard/media" ||
    path.startsWith("/dashboard/orders") ||
    path === "/dashboard/settings/project" ||
    path === "/dashboard/settings/setup" ||
    path === "/dashboard/settings/style" ||
    path === "/dashboard/settings/cart" ||
    path === "/dashboard/seo"
  );
}
// CRM screens: owner and clients only (designers do not see customer data).
export const crmRoute = (path: string) =>
  path === "/dashboard/crm" ||
  path.startsWith("/dashboard/crm/") ||
  path === "/dashboard/settings/crm" ||
  // Online bookings (customer data, like the CRM): owner and clients.
  path === "/dashboard/bookings" ||
  // Approvals (Approve / Skip / Edit of prepared posts, suggestions): owner and clients.
  path === "/dashboard/approvals";
export function clientRoute(path: string) {
  return (
    path === "/dashboard" ||
    crmRoute(path) ||
    path === "/dashboard/pages" ||
    (path.startsWith("/dashboard/pages/") && path !== "/dashboard/pages/new") ||
    path === "/dashboard/submissions" ||
    path === "/dashboard/shop-orders" ||
    path === "/dashboard/shop" ||
    path === "/dashboard/shop/products" ||
    path.startsWith("/dashboard/shop/products/") ||
    path === "/dashboard/shop/orders" ||
    path === "/dashboard/shop/settings" ||
    // Product catalogue of the website (no customer data: designers too).
    path === "/dashboard/catalog" ||
    path.startsWith("/dashboard/catalog/") ||
    path === "/dashboard/analytics" ||
    path === "/dashboard/social" ||
    path === "/dashboard/seo/assistant" ||
    // Onboarding autopilot: the client follows their own website's consultation/review.
    path === "/dashboard/onboarding" ||
    path.startsWith("/dashboard/onboarding/") ||
    path === "/dashboard/settings" ||
    path === "/dashboard/settings/client"
  );
}
