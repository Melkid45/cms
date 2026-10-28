import { requireSuperAdmin } from "@/lib/builder/current-user";
import { TeamAccounts } from "@/components/admin/team-accounts";
export default async function TeamPage() {
  await requireSuperAdmin();
  return <TeamAccounts />;
}
