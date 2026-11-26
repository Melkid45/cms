import {
  assertSameOrigin,
  clientIp,
  errorResponse,
} from "@/lib/builder/server";
import { createOrder } from "@/lib/builder/orders";
import { limitOrders } from "@/lib/builder/submissions";
export const runtime = "nodejs";
// Starts a public website-order interview. The token in the answer is the client's
// only key to the order (kept in their browser and in the order link).
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await limitOrders(clientIp(request), "start");
    return Response.json(await createOrder(), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
