import { authorizeWrite, errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { canAccessSite } from "@/lib/builder/access";
import { readRegistry } from "@/lib/builder/sites";
import { onboardingStore } from "@/lib/builder/onboarding/store";
import { startForNewCompany, startInput } from "@/lib/builder/onboarding/actions";
import { STEPS } from "@/lib/builder/onboarding/shared";

export const runtime = "nodejs";
// Admin overview of onboarding customers (which step each one is at). Super admin: all;
// designers and clients: websites in their scope. POST (super admin): start an onboarding
// for a new company; returns the private client link token once.
export async function GET(request: Request) {
  try {
    const identity = await authorizeWrite(request);
    const registry = await readRegistry();
    const records = await onboardingStore((data) => data.items, false);
    const rows = records
      .filter((r) => {
        const site = registry.sites.find((s) => s.id === r.siteId);
        return !!site && canAccessSite(identity, site);
      })
      .map((r) => ({
        id: r.id,
        business: r.business || registry.sites.find((s) => s.id === r.siteId)?.name || "",
        siteId: r.siteId,
        siteKey: registry.sites.find((s) => s.id === r.siteId)?.key ?? "",
        orderId: r.orderId,
        step: r.step,
        stepIndex: STEPS.findIndex((s) => s.id === r.step),
        test: r.test,
        mock: r.mock,
        pending: r.review.filter((i) => i.status !== "approved").length,
        approved: r.review.filter((i) => i.status === "approved").length,
        pages: r.pages.length,
        languages: [r.plan?.main, ...r.translations].filter(Boolean),
        ai: { calls: r.ai.calls, cost: r.ai.cost },
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    await authorizeWrite(request, true);
    const parsed = startInput.safeParse(await readJson(request, 4000));
    if (!parsed.success) throw new StoreError("Enter the business name.");
    const { record, token } = await startForNewCompany(parsed.data);
    return Response.json({ id: record.id, token });
  } catch (error) {
    return errorResponse(error);
  }
}
