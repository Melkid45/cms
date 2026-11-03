import { requireSuperAdmin } from "@/lib/builder/current-user";
import { Backups } from "@/components/admin/backups";
export default async function BackupsPage() {
  await requireSuperAdmin();
  return <Backups />;
}
