import {
  assertSameOrigin,
  clientIp,
  errorResponse,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import { after } from "next/server";
import {
  orderUpdate,
  readClientOrder,
  updateClientOrder,
  writeAiBrief,
} from "@/lib/builder/orders";
import { limitOrders } from "@/lib/builder/submissions";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
const token = (request: Request) => request.headers.get("x-order-token");
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    return Response.json(await readClientOrder(id, token(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    await limitOrders(clientIp(request), "save");
    const { id } = await params;
    const parsed = orderUpdate.safeParse(await readJson(request, 60000));
    if (!parsed.success) throw new StoreError("Check your answers.");
    const view = await updateClientOrder(id, token(request), parsed.data);
    // The AI summary for the team runs after the response, so the client never waits.
    if (parsed.data.submit) after(() => writeAiBrief(id));
    return Response.json(view);
  } catch (error) {
    return errorResponse(error);
  }
}
