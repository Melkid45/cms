import { requireSuperAdmin } from "@/lib/builder/current-user";
import { studioOverview } from "@/lib/builder/studio";
import { ClientsStudio } from "@/components/admin/clients-studio";
// Owner start page: what needs action across all clients, then companies → websites →
// client logins. Read-only aggregation; changes go through the existing APIs.
export default async function ClientsPage() {
  const user = await requireSuperAdmin();
  return <ClientsStudio data={await studioOverview(user)} />;
}
