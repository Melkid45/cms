import { redirect } from "next/navigation";
import { currentUser } from "@/lib/builder/current-user";
import { WebsiteOverview } from "@/components/admin/website-overview";
// The owner starts in the studio overview (all clients); clients and designers keep the
// overview of their website.
export default async function DashboardPage() {
  const user = await currentUser();
  if (user.role === "super-admin") redirect("/dashboard/clients");
  return <WebsiteOverview />;
}
