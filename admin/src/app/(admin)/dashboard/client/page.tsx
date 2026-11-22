import { requireSuperAdmin } from "@/lib/builder/current-user";
import { studioOverview } from "@/lib/builder/studio";
import { ClientManage } from "@/components/admin/client-manage";
// Owner, inside a client: rename, websites (Test / Live), client logins, unpaid invoices.
export default async function ClientPage() {
  const user = await requireSuperAdmin();
  return <ClientManage data={await studioOverview(user)} />;
}
