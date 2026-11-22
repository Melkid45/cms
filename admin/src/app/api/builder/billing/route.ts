import {
  authorizeWrite,
  errorResponse,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import {
  addonInput,
  enableAddon,
  invoiceAction,
  readBilling,
  runBilling,
  saveSettings,
  setInvoice,
  settingsInput,
} from "@/lib/builder/billing";
import { readRegistry } from "@/lib/builder/sites";
import { listOrders } from "@/lib/builder/orders";
export const runtime = "nodejs";
// Owner overview: clients (companies), websites, subscriptions, invoices and orders.
export async function GET(request: Request) {
  try {
    const viewer = await authorizeWrite(request, true);
    await runBilling();
    const [billing, registry, orders] = await Promise.all([
      readBilling(),
      readRegistry(),
      listOrders(viewer),
    ]);
    return Response.json(
      {
        ...billing,
        companies: registry.companies,
        sites: registry.sites,
        orders: orders.map((order) => ({
          id: order.id,
          number: order.number,
          status: order.status,
          contact: order.contact,
          business: order.answers.business || "",
          companyId: order.companyId,
          siteId: order.siteId,
          createdAt: order.createdAt,
          needsAction: order.needsAction,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    await authorizeWrite(request, true);
    const parsed = settingsInput.safeParse(await readJson(request, 40000));
    if (!parsed.success) throw new StoreError("Check the prices and days.");
    return Response.json(await saveSettings(parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    await authorizeWrite(request, true);
    const parsed = addonInput.safeParse(await readJson(request, 2000));
    if (!parsed.success) throw new StoreError("Choose a website and a module.");
    return Response.json(await enableAddon(parsed.data), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    await authorizeWrite(request, true);
    const parsed = invoiceAction.safeParse(await readJson(request, 2000));
    if (!parsed.success) throw new StoreError("Choose an invoice.");
    return Response.json(await setInvoice(parsed.data.id, parsed.data.action));
  } catch (error) {
    return errorResponse(error);
  }
}
