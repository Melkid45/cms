import { errorResponse, StoreError } from "@/lib/builder/server";
import { crmAccess } from "@/lib/builder/crm/access";
import { contactDetail } from "@/lib/builder/crm/actions";

export const runtime = "nodejs";
// Contact card: the contact with its figures, timeline and possible duplicates.
export async function GET(request: Request) {
  try {
    const { site } = await crmAccess(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id || id.length > 100) throw new StoreError("Choose a contact.");
    return Response.json(await contactDetail(site, id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
