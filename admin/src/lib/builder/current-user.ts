import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { localRequest, ownerIdentity, sessionIdentity } from "./auth";
import { accountIdentity } from "./accounts";
import type { Identity } from "./access";
import { readRegistry, resolveSite, siteCookie, workspace } from "./sites";
export async function currentUser() {
  if (localRequest(await headers())) return ownerIdentity();
  const session = sessionIdentity((await cookies()).get("cms_session")?.value);
  const user =
    session && session.role !== "super-admin"
      ? await accountIdentity(session.id, session.version)
      : session;
  if (!user) redirect("/login");
  return user;
}
// Owner and designers (design screens of the websites they are assigned to).
export async function requireDesigner() {
  const user = await currentUser();
  if (user.role === "client") redirect("/dashboard");
  return user;
}
export async function requireSuperAdmin() {
  const user = await currentUser();
  if (user.role !== "super-admin") redirect("/dashboard");
  return user;
}
// Companies/websites for the dashboard shell; the selected website comes from the cms_site cookie.
// The owner without a selected website is in studio mode (site: null): website screens
// send him to the clients table instead of silently opening the first website.
export async function currentWorkspace(user: Identity) {
  const registry = await readRegistry();
  const remembered = (await cookies()).get(siteCookie)?.value;
  let site = null;
  if (user.role === "super-admin")
    site = registry.sites.find((item) => item.id === remembered) ?? null;
  else
    try {
      site = (await resolveSite(user, null, remembered)).site;
    } catch {}
  return { site, ...workspace(registry, user) };
}
