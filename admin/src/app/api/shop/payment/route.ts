import {
  assertSameOrigin,
  errorResponse,
  readJson,
  StoreError,
  clientIp,
} from "@/lib/builder/server";
import {
  accessibleOrder,
  startPayment,
  reconcilePayment,
  resultPath,
} from "@/lib/builder/payments";
import { limitPaymentRequests } from "@/lib/builder/submissions";
export async function POST(r: Request) {
  let context: { site: string; order: string; token: string } | undefined;
  const form = r.headers
    .get("content-type")
    ?.includes("application/x-www-form-urlencoded");
  try {
    assertSameOrigin(r);
    await limitPaymentRequests(clientIp(r));
    const data = form
      ? Object.fromEntries(await r.formData())
      : ((await readJson(r, 3000)) as Record<string, unknown>);
    const { site, order, token, action } = data;
    if (
      typeof site !== "string" ||
      typeof order !== "string" ||
      typeof token !== "string"
    )
      throw new StoreError("Order not found.", 404);
    const o = await accessibleOrder(site, order, token);
    context = { site, order, token };
    if (action === "refresh") {
      if (o.payment?.providerId)
        await reconcilePayment(site, order, o.payment.providerId);
      return Response.redirect(new URL(resultPath(site, o), r.url), 303);
    }
    const result = await startPayment(site, order, token);
    return form
      ? Response.redirect(new URL(result.url, r.url), 303)
      : Response.json(result);
  } catch (e) {
    if (form && context)
      return Response.redirect(
        new URL(
          resultPath(context.site, {
            id: context.order,
            accessKey: context.token,
          }) + "&notice=payment_unavailable",
          r.url,
        ),
        303,
      );
    return errorResponse(e);
  }
}
