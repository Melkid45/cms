import { AdminShell } from "@/components/admin/admin-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { currentUser, currentWorkspace } from "@/lib/builder/current-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await currentUser();
  const workspace = await currentWorkspace(identity);
  return (
    // Tooltips exist only in the admin, so public website pages do not load their code.
    <TooltipProvider>
      <AdminShell identity={identity} workspace={workspace}>
        {children}
      </AdminShell>
    </TooltipProvider>
  );
}
