import { authorizeSite } from "@/lib/builder/sites";
import { readJson, errorResponse, StoreError } from "@/lib/builder/server";
import {
  readCommerceSettings,
  saveCommerceSettings,
  commerceInput,
} from "@/lib/builder/commerce-store";
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    return Response.json(await readCommerceSettings(site.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    const { site, identity } = await authorizeSite(request);
    if (identity.role === "designer")
      throw new StoreError(
        "Shop operations are managed by the shop owner.",
        403,
      );
    const value = commerceInput.safeParse(await readJson(request, 20000));
    if (!value.success)
      throw new StoreError(
        value.error.issues[0]?.message || "Check shop settings.",
      );
    return Response.json(await saveCommerceSettings(site.id, value.data));
  } catch (e) {
    return errorResponse(e);
  }
}
