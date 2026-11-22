import "server-only";
import { randomUUID } from "node:crypto";
import { withDoc } from "./doc-store";
import { legacySiteId } from "./server";
import { mailConnection } from "./smtp";
export type NotificationKind =
  | "order-new"
  | "order-confirmed"
  | "order-action"
  | "order-message"
  | "invoice-overdue"
  | "site-suspended"
  // CRM events of one website (enquiry, shop order, task due): see siteId.
  | "crm-enquiry"
  | "crm-order"
  | "crm-task"
  | "crm-booking";
export interface Notification {
  id: string;
  at: string;
  kind: NotificationKind;
  title: string;
  text: string;
  href?: string;
  // Who should see it: the owner always; a designer only for orders assigned to them.
  designerId?: string;
  // CRM notifications belong to one website: the owner and that website's clients see them;
  // each viewer has their own read state (readBy), designers never see them.
  siteId?: string;
  readBy?: string[];
  read: boolean;
}
type Store = { items: Notification[] };
const store = <T>(fn: (data: Store) => T, write = true) =>
  withDoc<Store, T>("notifications", () => ({ items: [] }), fn, write);
// Adds a notification for the team and, when the first website has email delivery,
// emails the owner. Email problems never block the action that triggered it.
export async function notifyTeam(
  input: Omit<Notification, "id" | "at" | "read">,
) {
  const item: Notification = {
    ...input,
    id: randomUUID(),
    at: new Date().toISOString(),
    read: false,
  };
  await store((data) => {
    data.items.unshift(item);
    data.items = data.items.slice(0, 500);
  });
  const owner = process.env.CMS_ADMIN_EMAIL;
  if (owner) {
    let connection: Awaited<ReturnType<typeof mailConnection>> = null;
    try {
      connection = await mailConnection(legacySiteId);
      if (connection)
        await connection.transport.sendMail({
          from: connection.from,
          to: owner,
          subject: `Harbstone: ${item.title}`.replace(/[\r\n]/g, " "),
          text: `${item.text}${item.href && process.env.NEXT_PUBLIC_SITE_URL ? `\n\n${new URL(item.href, process.env.NEXT_PUBLIC_SITE_URL)}` : ""}`,
        });
    } catch {
      // The notification is stored; email is best effort.
    } finally {
      connection?.transport.close();
    }
  }
  return item;
}
// CRM notification of a website: stored without the owner e-mail (each website has its own
// Telegram setting for that).
export async function notifySite(
  input: Omit<Notification, "id" | "at" | "read" | "designerId" | "readBy"> & {
    siteId: string;
  },
) {
  const item: Notification = {
    ...input,
    id: randomUUID(),
    at: new Date().toISOString(),
    read: false,
    readBy: [],
  };
  await store((data) => {
    data.items.unshift(item);
    data.items = data.items.slice(0, 500);
  });
  return item;
}
// sites: websites the viewer may open (needed for clients).
const visible = (
  item: Notification,
  viewer: { role: string; id: string },
  sites: string[],
) =>
  item.siteId
    ? viewer.role === "super-admin" ||
      (viewer.role === "client" && sites.includes(item.siteId))
    : viewer.role === "super-admin" ||
      (viewer.role === "designer" && item.designerId === viewer.id);
export const listNotifications = (
  viewer: { role: string; id: string },
  sites: string[] = [],
) =>
  store(
    (data) =>
      data.items
        .filter((item) => visible(item, viewer, sites))
        .map(({ readBy, ...item }) =>
          item.siteId
            ? { ...item, read: !!readBy?.includes(viewer.id) }
            : item,
        ),
    false,
  );
export const markNotifications = (
  viewer: { role: string; id: string },
  ids: string[] | "all",
  sites: string[] = [],
) =>
  store((data) => {
    for (const item of data.items)
      if (
        (ids === "all" || ids.includes(item.id)) &&
        visible(item, viewer, sites)
      ) {
        if (item.siteId) {
          item.readBy = [...new Set([...(item.readBy || []), viewer.id])].slice(-50);
        } else item.read = true;
      }
    return { ok: true };
  });
