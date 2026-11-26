import "server-only";
import { StoreError } from "../server";
import { authorizeSite } from "../sites";

// CRM of the selected website: the super admin and the website's clients (they run the
// business). Designers build websites and do not see customer data (403), like Shop orders.
export async function crmAccess(request: Request) {
  const access = await authorizeSite(request);
  if (access.identity.role === "designer")
    throw new StoreError("The CRM is managed by the website owner.", 403);
  return access;
}
