import "server-only";
import { notifySite } from "../notifications";
import { readRegistry } from "../sites";
import type { Submission } from "../submissions";
import type { ShopOrder } from "../shop";
import { crmStore, ingestNewEnquiry, ingestNewOrder, now } from "./store";
import { enquiryPerson, ingestBooking, type BookingFacts } from "./store";
import { sendTelegram } from "./telegram";
import { money } from "./shared";

// What happens after a new enquiry / shop order / due task: contact (+ deal), in-app
// notification for the website, Telegram message to the website owner's own bot.
// Called with after(), so a problem here never breaks the form or the checkout.

const adminLink = (path: string) => {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return /^https?:\/\//.test(base) ? `${base}${path}` : "";
};
const siteName = async (siteId: string) =>
  (await readRegistry()).sites.find((s) => s.id === siteId)?.name || "Website";
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export async function onEnquiry(siteId: string, item: Submission) {
  try {
    if (item.flag) return;
    const { contact } = await ingestNewEnquiry(siteId, item);
    const person = enquiryPerson(item.values);
    const href = contact ? `/dashboard/crm/${contact.id}` : "/dashboard/submissions";
    const who = person.name || person.email || person.phone || "Someone";
    const message = Object.entries(item.values)
      .filter(([k]) => !["name", "email", "phone"].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    await notifySite({
      siteId,
      kind: "crm-enquiry",
      title: `New enquiry: ${clip(who, 80)}`,
      text: clip(`${item.pageTitle}${message ? ` · ${message.replace(/\n/g, " · ")}` : ""}`, 300),
      href,
    });
    const link = adminLink(href);
    await sendTelegram(
      siteId,
      "enquiry",
      [
        `New enquiry — ${await siteName(siteId)}`,
        `Page: ${item.pageTitle}`,
        person.name && `Name: ${person.name}`,
        person.phone && `Phone: ${person.phone}`,
        person.email && `E-mail: ${person.email}`,
        message && `\n${clip(message, 1500)}`,
        link && `\nOpen: ${link}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch {
    // Best effort: the enquiry itself is already saved.
  }
}

export async function onShopOrder(siteId: string, order: ShopOrder) {
  try {
    const contact = await ingestNewOrder(siteId, order);
    const total = money(order.total ?? order.subtotal, order.currency);
    const href = contact ? `/dashboard/crm/${contact.id}` : "/dashboard/shop/orders";
    await notifySite({
      siteId,
      kind: "crm-order",
      title: `New order #${order.number} · ${total}`,
      text: clip(`${order.customer.name} · ${order.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}`, 300),
      href: "/dashboard/shop/orders",
    });
    const link = adminLink(href);
    await sendTelegram(
      siteId,
      "order",
      [
        `New order #${order.number} — ${await siteName(siteId)}`,
        ...order.items.map((i) => `${i.qty} × ${i.name} — ${money(i.total, order.currency)}`),
        `Total: ${total}`,
        `${order.customer.name} · ${order.customer.phone}${order.customer.email ? ` · ${order.customer.email}` : ""}`,
        order.delivery.method === "pickup" ? "Pickup" : `Delivery: ${order.delivery.address}`,
        link && `\nOpen: ${link}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch {
    // Best effort: the order itself is already saved.
  }
}

// Tasks that became due and were not reminded yet: one in-app notification + Telegram
// message each. Runs when the dashboard polls the CRM badge and from /api/cron/crm.
export async function remindDueTasks(siteId: string) {
  const at = now();
  const isDue = (t: { done: boolean; due: string; remindedAt?: string }) =>
    !t.done && !!t.due && Date.parse(t.due) <= Date.now() && !t.remindedAt;
  if (!(await crmStore(siteId, (data) => data.tasks.some(isDue), false))) return 0;
  const due = await crmStore(
    siteId,
    (data) => {
      const list = data.tasks.filter(isDue);
      for (const t of list) t.remindedAt = at;
      return list.map((t) => ({
        ...t,
        contact: data.contacts.find((c) => c.id === t.contactId)?.name || "",
      }));
    },
  );
  if (!due.length) return 0;
  const name = await siteName(siteId);
  for (const task of due.slice(0, 20)) {
    await notifySite({
      siteId,
      kind: "crm-task",
      title: `Task due: ${clip(task.title, 100)}`,
      text: task.contact ? `Contact: ${task.contact}` : "",
      href: task.contactId ? `/dashboard/crm/${task.contactId}` : "/dashboard/crm/tasks",
    }).catch(() => {});
    const link = adminLink("/dashboard/crm/tasks");
    await sendTelegram(
      siteId,
      "task",
      [`Task due — ${name}`, task.title, task.contact && `Contact: ${task.contact}`, link && `\nOpen: ${link}`]
        .filter(Boolean)
        .join("\n"),
    ).catch(() => false);
  }
  return due.length;
}

// Online booking (lib/builder/booking): contact + timeline event, in-app notification and
// Telegram message. kind = "new" | "cancelled" (by the customer's link) | "changed" (team).
export async function onBooking(
  siteId: string,
  b: BookingFacts & { price?: number; currency?: string },
  kind: "new" | "cancelled" | "changed",
  by = "Website",
) {
  try {
    const what = `${b.service}${b.staff ? ` · ${b.staff}` : ""} · ${b.when}`;
    const text =
      kind === "new"
        ? `Booking #${b.number}: ${what} (${b.status})`
        : kind === "cancelled"
          ? `Booking #${b.number} cancelled by the customer: ${what}`
          : `Booking #${b.number}: ${what} — ${b.status}`;
    const contact = await ingestBooking(siteId, b, text, by);
    if (kind === "changed") return;
    const href = "/dashboard/bookings";
    const title = kind === "new" ? `New booking: ${clip(b.customer.name, 60)} · ${b.when}` : `Booking cancelled: ${clip(b.customer.name, 60)} · ${b.when}`;
    await notifySite({ siteId, kind: "crm-booking", title, text: clip(what, 300), href });
    const link = adminLink(contact ? `/dashboard/crm/${contact.id}` : href);
    await sendTelegram(
      siteId,
      "booking",
      [
        `${kind === "new" ? "New booking" : "Booking cancelled"} #${b.number} — ${await siteName(siteId)}`,
        b.service,
        b.staff && `With: ${b.staff}`,
        `When: ${b.when}`,
        `${b.customer.name} · ${b.customer.phone}${b.customer.email ? ` · ${b.customer.email}` : ""}`,
        kind === "new" && `Status: ${b.status}`,
        link && `\nOpen: ${link}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch {
    // Best effort: the booking itself is already saved.
  }
}
