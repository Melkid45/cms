import {
  authorizeWrite,
  errorResponse,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import { readOrder, teamUpdate, updateOrder } from "@/lib/builder/orders";
import { listAccounts, saveAccount } from "@/lib/builder/accounts";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await authorizeWrite(request, "design");
    const { id } = await params;
    return Response.json(await readOrder(id, viewer), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, { params }: Params) {
  try {
    const viewer = await authorizeWrite(request, "design");
    const { id } = await params;
    const parsed = teamUpdate.safeParse(await readJson(request, 8000));
    if (!parsed.success) throw new StoreError("Invalid order update.");
    if (parsed.data.designerId && viewer.role === "super-admin") {
      const designer = (await listAccounts()).find(
        (account) =>
          account.id === parsed.data.designerId &&
          account.role === "designer" &&
          !account.disabled,
      );
      if (!designer) throw new StoreError("Choose an active designer.", 404);
      // The designer gets access to the website of the order.
      const order = await readOrder(id, viewer);
      if (order.siteId && !designer.scope.sites.includes(order.siteId))
        await saveAccount({
          id: designer.id,
          scope: {
            ...designer.scope,
            sites: [...designer.scope.sites, order.siteId],
          },
        });
    }
    return Response.json(await updateOrder(id, viewer, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
