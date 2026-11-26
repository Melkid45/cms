import { errorResponse } from "@/lib/builder/server";
import { crmAccess } from "@/lib/builder/crm/access";
import { crmOverview } from "@/lib/builder/crm/actions";

export const runtime = "nodejs";
// Today's figures of the selected website for the dashboard Overview.
export async function GET(request: Request) {
  try {
    const { site } = await crmAccess(request);
    return Response.json(await crmOverview(site), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
