import {
  assertSameOrigin,
  clientIp,
  errorResponse,
  StoreError,
} from "@/lib/builder/server";
import { addOrderFile } from "@/lib/builder/orders";
import { limitOrders } from "@/lib/builder/submissions";
export const runtime = "nodejs";
// Client uploads an existing brief (PDF/Word/text) into the interview.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await limitOrders(clientIp(request), "save");
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new StoreError("Upload a file under 10 MB.", 413);
    const { id } = await params;
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new StoreError("Choose a file.");
    return Response.json(
      await addOrderFile(id, request.headers.get("x-order-token"), file),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
