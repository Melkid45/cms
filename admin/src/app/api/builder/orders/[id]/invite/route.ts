import { randomBytes } from "node:crypto";
import {
  authorizeWrite,
  errorResponse,
  StoreError,
} from "@/lib/builder/server";
import { linkOrder, readOrder } from "@/lib/builder/orders";
import { saveAccount } from "@/lib/builder/accounts";
export const runtime = "nodejs";
// Owner creates the client login for the website of the order. The password is
// returned once so the owner can pass it on; only its hash is stored.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await authorizeWrite(request, true);
    const { id } = await params;
    const order = await readOrder(id, viewer);
    if (!order.siteId)
      throw new StoreError("The website is not created yet.", 409);
    if (order.accountId)
      throw new StoreError("The client already has a login.", 409);
    const password = randomBytes(15).toString("base64url");
    const account = await saveAccount({
      name: order.contact.name || order.contact.email,
      email: order.contact.email,
      password,
      role: "client",
      scope: { companies: [], sites: [order.siteId] },
    });
    await linkOrder(id, { accountId: account.id }, "Client login created");
    return Response.json(
      { email: account.email, password },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
