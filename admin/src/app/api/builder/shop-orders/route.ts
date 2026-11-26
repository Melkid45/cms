import { uiText } from "@/lib/builder/i18n";
import { limitSmtpVerification } from "@/lib/builder/submissions";
import { readProject } from "@/lib/builder/server";
import { readCommerceSettings } from "@/lib/builder/commerce-store";
import {
  sendOrderMail,
  notifyShop,
  confirmToBuyer,
  orderMailHtml,
} from "@/lib/builder/shop";
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
    const url = new URL(request.url);
    if (url.searchParams.has("preview")) {
      const target = url.searchParams.get("preview");
      if (target !== "shop" && target !== "buyer")
        throw new StoreError("Choose a valid email.");
      const order = (await listShopOrders(site.id)).find(
        (o) => o.id === url.searchParams.get("id"),
      );
      if (!order) throw new StoreError("Order not found.", 404);
      const project = await readProject(site.id);
      const t = uiText(order.locale);
      return new Response(
        orderMailHtml(
          order,
          project.brand.name,
          target === "shop"
            ? "New order"
            : t.orderSubject.replace("{n}", String(order.number)),
          target === "shop"
            ? `Customer: ${order.customer.name}\n${order.customer.email}\n${order.customer.phone}${order.comment ? "\n\nComment: " + order.comment : ""}`
            : t.orderIntro +
                "\n\n" +
                [project.website?.phone, project.website?.contactEmail]
                  .filter(Boolean)
                  .join(" · "),
        ),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    return Response.json(await listShopOrders(site.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const { site, identity } = await shopAccess(request);
    const value = z
      .object({
        id: z.string().min(1).max(100),
        revision: z.number().int().nonnegative(),
        status: z.enum(SHOP_STATUSES).optional(),
        note: z.string().max(4000).optional(),
        paymentStatus:z.enum(["paid","unpaid"]).optional(),
      })
      .strict()
      .safeParse(await readJson(request, 12000));
    if (
      !value.success ||
      (value.data.status === undefined && value.data.note === undefined && value.data.paymentStatus===undefined)
    )
      throw new StoreError("Choose an order and a valid update.");
    const { id, ...patch } = value.data;
    return Response.json(
      await updateShopOrder(site.id, id, { ...patch, actor: identity.id }),
    );
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

export async function POST(request: Request) {
  try {
    const { site, identity } = await shopAccess(request);
    await limitSmtpVerification(`order-mail:${identity.id}`);
    const parsed = z
      .object({
        id: z.string().min(1).max(100),
        target: z.enum(["shop", "buyer"]),
        retryUncertain: z.boolean().optional(),
      })
      .strict()
      .safeParse(await readJson(request, 2000));
    if (!parsed.success)
      throw new StoreError("Choose an order and email recipient.");
    const [project, settings] = await Promise.all([
      readProject(site.id),
      readCommerceSettings(site.id),
    ]);
    const { id, target } = parsed.data;
    const result = await sendOrderMail(
      site.id,
      id,
      target,
      (order) =>
        target === "shop"
          ? notifyShop(
              site.id,
              order,
              settings.notifications.recipient ||
                project.forms?.recipient ||
                "",
              project.brand.name,
            )
          : settings.notifications.buyerConfirmation
            ? confirmToBuyer(site.id, order, project.brand.name, {
                email: project.website?.contactEmail,
                phone: project.website?.phone,
              })
            : Promise.resolve("none"),
      parsed.data.retryUncertain,
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
