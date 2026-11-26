import { OrdersScreen } from "@/components/admin/orders/orders-screen";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return <OrdersScreen tab={tab === "requests" ? "requests" : "orders"} />;
}
