import { requireSuperAdmin } from "@/lib/builder/current-user";
import { WebsiteOverview } from "@/components/admin/website-overview";
// Owner: overview of the selected website (the owner's /dashboard is the studio overview).
export default async function WebsiteOverviewPage() {
  await requireSuperAdmin();
  return <WebsiteOverview />;
}
