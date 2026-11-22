import type { Metadata } from "next";
import { OrderChat } from "@/components/order/order-chat";

export const metadata: Metadata = {
  title: { absolute: "Order a website — Harbstone" },
  description:
    "Answer a few questions and get a clear brief for your new website.",
};

export default function OrderPage() {
  return <OrderChat />;
}
