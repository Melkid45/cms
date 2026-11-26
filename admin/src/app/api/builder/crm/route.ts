import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { crmAccess } from "@/lib/builder/crm/access";
import { crmAction, crmData, runAction } from "@/lib/builder/crm/actions";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

// Contacts, deals, tasks, stages and settings of the selected website.
export async function GET(request: Request) {
  try {
    const { site, identity } = await crmAccess(request);
    return Response.json(await crmData(site, identity), { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
// One change ({action: "contact.update", ...}); answers with its result and fresh data.
export async function POST(request: Request) {
  try {
    const { site, identity } = await crmAccess(request);
    const parsed = crmAction.safeParse(await readJson(request, 1_500_000));
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path.filter((p) => typeof p === "string").at(-1);
      throw new StoreError(field && field !== "action" ? `Check the field "${String(field)}".` : "Check the entered data.");
    }
    const result = await runAction(site, identity, parsed.data);
    return Response.json({ result, data: await crmData(site, identity) }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
