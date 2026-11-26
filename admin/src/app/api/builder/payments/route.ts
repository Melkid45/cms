import { authorizeSite } from "@/lib/builder/sites";
import { readJson, errorResponse, StoreError } from "@/lib/builder/server";
import {
  paymentSettings,
  paymentSettingsView,
  paymentSettingsInput,
  savePaymentSettings,
} from "@/lib/builder/payment-settings";
async function access(r: Request) {
  const a = await authorizeSite(r);
  if (a.identity.role === "designer")
    throw new StoreError("Payments are managed by the shop owner.", 403);
  return a;
}
export async function GET(r: Request) {
  try {
    const { site } = await access(r);
    return Response.json(paymentSettingsView(await paymentSettings(site.id)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(r: Request) {
  try {
    const { site } = await access(r);
    const input = paymentSettingsInput.safeParse(await readJson(r, 12000));
    if (!input.success)
      throw new StoreError(
        input.error.issues[0]?.message || "Check payment settings.",
      );
    return Response.json(await savePaymentSettings(site.id, input.data));
  } catch (e) {
    return errorResponse(e);
  }
}
