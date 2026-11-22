import { requireDesigner } from "@/lib/builder/current-user";
// Orders and change requests: owner and designers only.
export default async function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDesigner();
  return children;
}
