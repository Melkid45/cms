import type { Metadata } from "next";
import { OrderHeader } from "@/components/order/order-shared";
import { OnboardingApp } from "@/components/onboarding/onboarding-app";

export const metadata: Metadata = {
  title: { absolute: "Your new website — Harbstone" },
  robots: { index: false, follow: false },
};

// Private client page of the onboarding autopilot (link with #t=<token>).
export default async function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#161616]" style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>
      <OrderHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-24 sm:px-6">
        <OnboardingApp id={id} mode="customer" />
      </main>
    </div>
  );
}
