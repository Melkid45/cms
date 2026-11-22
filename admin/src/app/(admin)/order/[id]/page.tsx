import type { Metadata } from "next";
import { OrderStatus } from "@/components/order/order-status";

export const metadata: Metadata = {
  title: { absolute: "Your order — Harbstone" },
  robots: { index: false, follow: false },
};

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderStatus id={id} />;
}
