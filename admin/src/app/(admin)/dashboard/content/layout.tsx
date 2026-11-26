import { requireDesigner } from "@/lib/builder/current-user";
export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDesigner();
  return children;
}
