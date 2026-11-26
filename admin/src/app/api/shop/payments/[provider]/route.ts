import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { paymentSettings, paymentSecret } from "@/lib/builder/payment-settings";
import {
  verifyStripeSignature,
  reconcilePayment,
} from "@/lib/builder/payments";
export const runtime = "nodejs";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider } = await params;
    const site = new URL(r.url).searchParams.get("site");
    if (!site || site.length > 40) throw new StoreError("Unknown shop.", 404);
    const settings = await paymentSettings(site);
    let order: string | undefined, id: string | undefined;
    if (provider === "stripe") {
      const length = Number(r.headers.get("content-length") || 0);
      if (length > 100000) throw new StoreError("Payload too large.", 413);
      const raw = await r.text();
      if (raw.length > 100000) throw new StoreError("Payload too large.", 413);
      if (
        !settings.stripeWebhook ||
        !verifyStripeSignature(
          raw,
          r.headers.get("stripe-signature") || "",
          paymentSecret(settings, "stripeWebhook"),
        )
      )
        throw new StoreError("Invalid signature.", 400);
      const event = JSON.parse(raw);
      if (
        ![
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
          "checkout.session.expired",
        ].includes(event.type)
      )
        return Response.json({ ok: true });
      if (event.data?.object?.metadata?.site !== site)
        throw new StoreError("Wrong shop.", 400);
      order = event.data.object.metadata.order;
      id = event.data.object.id;
    } else if (provider === "yookassa") {
      const event = (await readJson(r, 20000)) as {
        object?: { id?: string; metadata?: { order?: string; site?: string } };
      };
      if (!settings.yooKey) throw new StoreError("Unknown shop.", 404);
      // The notification is only a hint. The authenticated API response is authoritative.
      if (event.object?.metadata?.site !== site)
        throw new StoreError("Wrong shop.");
      order = event.object.metadata.order;
      id = event.object.id;
    } else throw new StoreError("Unknown provider.", 404);
    if (typeof order !== "string" || typeof id !== "string")
      throw new StoreError("Invalid notification.");
    await reconcilePayment(site, order, id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
