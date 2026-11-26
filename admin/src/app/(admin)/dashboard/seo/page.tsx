import { requireDesigner } from "@/lib/builder/current-user";
import { SeoDashboard } from "@/components/admin/seo-dashboard";
// SEO of the selected website (design roles: clients cannot change SEO, see ACCESS.md).
export default async function SeoPage() {
  await requireDesigner();
  return <SeoDashboard />;
}
