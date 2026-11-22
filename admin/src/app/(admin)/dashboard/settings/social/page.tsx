import { requireSuperAdmin } from "@/lib/builder/current-user";
import { SocialAccounts } from "@/components/admin/social/social-accounts";
// Connected social accounts of the selected website: super admin only.
export default async function SocialAccountsPage() {
  await requireSuperAdmin();
  return <SocialAccounts />;
}
