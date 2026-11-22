import { z } from "zod";
import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import {
  deleteShopOrders,
  listShopOrders,
  SHOP_STATUSES,
  updateShopOrder,
} from "@/lib/builder/shop";

// Shop orders of the selected website. Read and status changes: super admin and the
// website's client (they run the shop); designers build the site but do not see customer
// data. Deleting: super admin only.
async function shopAccess(request: Request, ownerOnly = false) {
  const access = await authorizeSite(request, ownerOnly);
  if (access.identity.role === "designer")
    throw new StoreError("Shop orders are managed by the shop owner.", 403);
  return access;
}
export async function GET(request: Request) {
  try {
    const { site } = await shopAccess(request);
    return Response.json(await listShopOrders(site.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const { site } = await shopAccess(request);
    const value = z
      .object({
        id: z.string().min(1).max(100),
        revision: z.number().int().nonnegative(),
        status: z.enum(SHOP_STATUSES).optional(),
        note: z.string().max(4000).optional(),
      })
      .strict()
      .safeParse(await readJson(request, 12000));
    if (
      !value.success ||
      (value.data.status === undefined && value.data.note === undefined)
    )
      throw new StoreError("Choose an order and a valid update.");
    const { id, ...patch } = value.data;
    return Response.json(await updateShopOrder(site.id, id, patch));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const { site } = await shopAccess(request, true);
    const value = z
      .object({ ids: z.array(z.string().min(1).max(100)).min(1).max(500) })
      .strict()
      .safeParse(await readJson(request, 60000));
    if (!value.success) throw new StoreError("Choose orders to delete.");
    return Response.json(await deleteShopOrders(site.id, value.data.ids));
  } catch (error) {
    return errorResponse(error);
  }
}
