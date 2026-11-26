import { requireSuperAdmin } from "@/lib/builder/current-user";
export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();
  return children;
}
