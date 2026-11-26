import { requireSuperAdmin } from "@/lib/builder/current-user";
import { BillingDashboard } from "@/components/admin/billing/billing-dashboard";
export default async function BillingPage() {
  await requireSuperAdmin();
  return <BillingDashboard />;
}
