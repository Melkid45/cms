import { readRegistry } from "@/lib/builder/sites";
import { accessibleOrder } from "@/lib/builder/payments";
import { paymentSettings } from "@/lib/builder/payment-settings";
import { paymentLabels } from "@/lib/builder/payments-shared";
import { readProject, errorResponse } from "@/lib/builder/server";
export const runtime = "nodejs";
export async function GET(r: Request) {
  try {
    const q = new URL(r.url).searchParams,
      site = q.get("site") || "",
      id = q.get("order") || "",
      token = q.get("token") || "";
    const o = await accessibleOrder(site, id, token);
    const [settings, project, registry] = await Promise.all([
      paymentSettings(site),
      readProject(site),
      readRegistry(),
    ]);
    const home = `/site/${registry.sites.find((s) => s.id === site)?.key || ""}`;
    const e = (v: unknown) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      );
    const money = (n: number) => e(n.toFixed(2) + " " + o.currency);
    const paid = o.payment?.status === "paid";
    const online =
      o.payment && ["stripe", "yookassa"].includes(o.payment.method);
    const cancelled =
      o.status === "cancelled" || o.payment?.status === "cancelled";
    const hidden = `<input type="hidden" name="site" value="${e(site)}"><input type="hidden" name="order" value="${e(id)}"><input type="hidden" name="token" value="${e(token)}">`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="strict-origin"><title>Order #${o.number}</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f5f5;color:#202020;font:16px/1.6 system-ui,sans-serif}main{max-width:720px;margin:48px auto;padding:32px;background:white;border-radius:20px}h1{font-size:32px;line-height:1.15;margin:24px 0 12px}p{color:#666}.badge{display:inline-block;padding:6px 12px;background:#f1f1f1;border-radius:8px;font-size:14px}table{width:100%;border-collapse:collapse;margin:28px 0}td{padding:16px 0;border-bottom:1px solid #eee}td:last-child{text-align:right}small{display:block;color:#777}button{border:0;padding:14px 22px;border-radius:8px;background:#202020;color:white;font:inherit;cursor:pointer}form{display:inline-block;margin:8px 8px 8px 0}pre{white-space:pre-wrap;font:inherit}a{color:inherit}@media(max-width:600px){main{margin:16px;padding:24px}h1{font-size:28px}}</style></head><body><main><strong>${e(project.brand.name)}</strong><h1>${paid ? "Payment received" : cancelled ? "Order cancelled" : "Order received"}</h1><span class="badge">Order #${o.number} · ${paid ? "Paid" : cancelled ? "Cancelled" : online ? "Awaiting payment" : "Unpaid"}</span>${q.get("notice") === "payment_unavailable" ? "<p>Could not update the payment. Your order is saved. Please try again or contact the shop.</p>" : ""}<p>${paid ? "Thank you. The shop will contact you about your order." : cancelled ? "Please contact the shop if you need assistance." : online ? "Your order is saved. Complete payment using the button below." : "Your order is saved. The shop will contact you to confirm the details."}</p><table>${o.items.map((i) => `<tr><td>${e(i.name)}<small>${e(i.options.join(" · "))} · ${i.qty} × ${money(i.unitPrice)}</small></td><td>${money(i.total)}</td></tr>`).join("")}<tr><td>${o.delivery.method === "pickup" ? "Pickup" : "Delivery"}</td><td>${money(o.delivery.price || 0)}</td></tr><tr><td><strong>Total</strong></td><td><strong>${money(o.total ?? o.subtotal)}</strong></td></tr></table><p>${e(paymentLabels[o.payment?.method || "on_receipt"])}</p>${o.payment?.method === "invoice" && !cancelled ? `<pre>${e(o.payment.instructions || settings.invoiceInstructions)}</pre>` : ""}${o.payment?.test ? "<p>Test payment · no real money was charged.</p>" : ""}${online && !paid && !cancelled ? `<form method="post" action="/api/shop/payment">${hidden}<button type="submit">Continue to payment</button></form><form method="post" action="/api/shop/payment">${hidden}<input type="hidden" name="action" value="refresh"><button type="submit">Check payment status</button></form>` : ""}${o.payment?.needsReview ? "<p>This payment needs review by the shop. Please contact us.</p>" : ""}<p>${e(project.website?.contactEmail || "")}${project.website?.phone ? " · " + e(project.website.phone) : ""}</p><a href="${e(project.website?.url && /^https?:\/\//.test(project.website.url) ? project.website.url : home)}">Back to website</a></main></body></html>`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "strict-origin",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://checkout.stripe.com https://yoomoney.ru https://yookassa.ru https://*.yookassa.ru; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
