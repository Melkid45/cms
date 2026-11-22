import { authorizeWrite, errorResponse } from "@/lib/builder/server";
import { listOrders } from "@/lib/builder/orders";
export const runtime = "nodejs";
// Owner: every order. Designer: orders assigned to them.
export async function GET(request: Request) {
  try {
    const viewer = await authorizeWrite(request, "design");
    return Response.json(await listOrders(viewer), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
