import type { Metadata } from "next";
import { BookingManage } from "@/components/booking/booking-manage";

export const metadata: Metadata = {
  title: { absolute: "Your booking" },
  robots: { index: false, follow: false },
};

// Customer's booking from the signed link (success screen of contact-v60 / confirmation e-mail).
export default async function BookingCancelPage({ searchParams }: PageProps<"/booking/cancel">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  return <BookingManage site={one(q.site)} id={one(q.id)} token={one(q.t)} />;
}
