import { errorResponse, StoreError } from "@/lib/builder/server";
import { readClientOrder } from "@/lib/builder/orders";
import { onboardingForOrder } from "@/lib/builder/onboarding/actions";

export const runtime = "nodejs";
// Order status page → onboarding of that order (the order token proves access).
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    await readClientOrder(orderId, request.headers.get("x-order-token"));
    const id = await onboardingForOrder(orderId);
    if (!id) throw new StoreError("No consultation yet.", 404);
    return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
