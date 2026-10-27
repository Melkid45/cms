import { AdminShell } from "@/components/admin/admin-shell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { localAccess, verifySession } from "@/lib/builder/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    !localAccess() &&
    !verifySession((await cookies()).get("cms_session")?.value)
  )
    redirect("/login");
  return <AdminShell>{children}</AdminShell>;
}
