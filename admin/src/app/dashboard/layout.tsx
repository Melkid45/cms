import { AdminShell } from "@/components/admin/admin-shell";
import { currentUser } from "@/lib/builder/current-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await currentUser();
  return <AdminShell identity={identity}>{children}</AdminShell>;
}
