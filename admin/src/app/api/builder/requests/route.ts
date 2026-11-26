import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import {
  createRequest,
  listRequests,
  newRequest,
  requestUpdate,
  updateRequest,
} from "@/lib/builder/change-requests";
export const runtime = "nodejs";
// Change requests of the selected website (?site=). The owner sees all of them with
// ?all=1; designers see the ones assigned to them.
export async function GET(request: Request) {
  try {
    const { identity, site } = await authorizeSite(request);
    const all =
      identity.role !== "client" &&
      new URL(request.url).searchParams.get("all") === "1";
    return Response.json(
      await listRequests(identity, all ? undefined : site.id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { identity, site } = await authorizeSite(request);
    const parsed = newRequest.safeParse(await readJson(request, 10000));
    if (!parsed.success)
      throw new StoreError("Describe the change in a few words.");
    return Response.json(
      await createRequest(identity, site, parsed.data.text),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const { identity, site } = await authorizeSite(request);
    const parsed = requestUpdate.safeParse(await readJson(request, 6000));
    if (!parsed.success) throw new StoreError("Invalid request update.");
    return Response.json(await updateRequest(identity, site.id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
