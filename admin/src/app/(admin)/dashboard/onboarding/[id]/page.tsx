import Link from "next/link";
import { OnboardingApp } from "@/components/onboarding/onboarding-app";

// Team / client account view of one onboarding (BUILDER.md → Onboarding autopilot).
export default async function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="grid gap-4">
      <Link href="/dashboard/onboarding" className="w-fit text-sm text-neutral-500 hover:text-black">
        ← All onboardings
      </Link>
      <OnboardingApp id={id} mode="dashboard" />
    </div>
  );
}
