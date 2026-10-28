import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { localAccess, ownerIdentity, sessionIdentity } from "./auth";
import { accountIdentity } from "./accounts";
export async function currentUser() {
  if (localAccess()) return ownerIdentity();
  const session = sessionIdentity((await cookies()).get("cms_session")?.value);
  const user =
    session?.role === "client"
      ? await accountIdentity(session.id, session.version)
      : session;
  if (!user) redirect("/login");
  return user;
}
export async function requireSuperAdmin() {
  const user = await currentUser();
  if (user.role !== "super-admin") redirect("/dashboard");
  return user;
}
