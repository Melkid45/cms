import { requireDesigner } from "@/lib/builder/current-user";
export default async function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDesigner();
  return children;
}
