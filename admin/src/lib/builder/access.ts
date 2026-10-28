export type Role = "super-admin" | "client";
export interface Identity {
  id: string;
  email: string;
  name: string;
  role: Role;
  version: number;
}
export function clientRoute(path: string) {
  return path === "/dashboard" || path === "/dashboard/pages" ||
    (path.startsWith("/dashboard/pages/") && path !== "/dashboard/pages/new") ||
    path === "/dashboard/submissions" || path === "/dashboard/settings" ||
    path === "/dashboard/settings/client";
}
