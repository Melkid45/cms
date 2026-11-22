import {
  assertSameOrigin,
  errorResponse,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import {
  clientView,
  confirmClientOrder,
  confirmInput,
  linkOrder,
} from "@/lib/builder/orders";
import { createCompany, createSite } from "@/lib/builder/sites";
import { publicPrices, startBilling } from "@/lib/builder/billing";
import { notifyTeam } from "@/lib/builder/notifications";
import { startForOrder } from "@/lib/builder/onboarding/actions";
export const runtime = "nodejs";
// Client confirms the brief and plan: the order goes to the team, a company and a
// draft website are created from the sample site, and billing starts.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const parsed = confirmInput.safeParse(await readJson(request, 2000));
    if (!parsed.success) throw new StoreError("Choose a plan.");
    const prices = await publicPrices();
    const order = await confirmClientOrder(
      id,
      request.headers.get("x-order-token"),
      parsed.data.plan,
      parsed.data.pack,
      prices[parsed.data.pack].hours,
    );
    const business = (order.answers.business || "New client").slice(0, 100);
    const company = await createCompany({ name: business });
    const site = await createSite({ companyId: company.id, name: business });
    await startBilling({
      siteId: site.id,
      companyId: company.id,
      orderId: order.id,
      email: order.contact.email,
      plan: parsed.data.plan,
      pack: parsed.data.pack,
      business,
    });
    const linked = await linkOrder(
      order.id,
      { companyId: company.id, siteId: site.id },
      `Draft website created: /site/${site.key}`,
    );
    // Onboarding autopilot: the client continues with the AI consultation on the order page.
    await startForOrder({
      id: order.id,
      siteId: site.id,
      companyId: company.id,
      business,
      answers: order.answers,
    }).catch(() => undefined);
    await notifyTeam({
      kind: "order-confirmed",
      title: `Order #${order.number} confirmed`,
      text: `${business} confirmed the brief: ${parsed.data.pack} pack, ${parsed.data.plan} hosting. A draft website is ready. ${order.needsAction}`,
      href: `/dashboard/orders/${order.id}`,
    });
    return Response.json(clientView(linked));
  } catch (error) {
    return errorResponse(error);
  }
}
