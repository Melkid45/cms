import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withDoc } from "./doc-store";
import { StoreError } from "./server";
import { notifyTeam } from "./notifications";
import { invoiceChange } from "./billing";
import type { Identity } from "./access";
// Clients edit content only. Anything else ("make this different") is a change
// request: the owner quotes a price, the client accepts, an invoice is issued and the
// design team gets the task. Later an AI assistant may prepare the quote.
export type RequestStatus = "new" | "quoted" | "accepted" | "declined" | "done";
export interface ChangeRequest {
  id: string;
  number: number;
  siteId: string;
  companyId: string;
  accountId: string;
  author: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  status: RequestStatus;
  price?: number;
  quoteNote?: string;
  invoiceId?: string;
  designerId?: string;
}
type Store = { next: number; items: ChangeRequest[] };
const store = <T>(fn: (data: Store) => T | Promise<T>, write = true) =>
  withDoc<Store, T>(
    "change-requests",
    () => ({ next: 1, items: [] }),
    fn,
    write,
  );
export const newRequest = z
  .object({ text: z.string().trim().min(5).max(4000) })
  .strict();
export const requestUpdate = z
  .object({
    id: z.string().max(100),
    action: z.enum(["quote", "accept", "decline", "done", "assign"]),
    price: z.number().min(0).max(100000).optional(),
    quoteNote: z.string().max(2000).optional(),
    designerId: z.string().max(100).nullable().optional(),
  })
  .strict();
export async function createRequest(
  viewer: Identity,
  site: { id: string; companyId: string; name: string },
  text: string,
) {
  const item = await store((data) => {
    if (
      data.items.filter((r) => r.siteId === site.id && r.status === "new")
        .length >= 20
    )
      throw new StoreError("Too many open requests for this website.", 429);
    const now = new Date().toISOString();
    const request: ChangeRequest = {
      id: randomUUID(),
      number: data.next++,
      siteId: site.id,
      companyId: site.companyId,
      accountId: viewer.id,
      author: viewer.name || viewer.email,
      text,
      createdAt: now,
      updatedAt: now,
      status: "new",
    };
    data.items.unshift(request);
    return request;
  });
  await notifyTeam({
    kind: "order-action",
    title: `Change request #${item.number} — ${site.name}`,
    text: `${item.author}: ${text.slice(0, 300)}`,
    href: "/dashboard/orders?tab=requests",
  });
  return item;
}
// Owner: all requests. Designer: requests assigned to them. Client: their website.
export const listRequests = (viewer: Identity, siteId?: string) =>
  store(
    (data) =>
      data.items.filter((r) =>
        viewer.role === "super-admin"
          ? !siteId || r.siteId === siteId
          : viewer.role === "designer"
            ? r.designerId === viewer.id
            : r.siteId === siteId,
      ),
    false,
  );
export async function updateRequest(
  viewer: Identity,
  siteId: string | undefined,
  input: z.infer<typeof requestUpdate>,
) {
  const owner = viewer.role === "super-admin";
  let toInvoice: ChangeRequest | undefined;
  const result = await store((data) => {
    const item = data.items.find((r) => r.id === input.id);
    if (!item) throw new StoreError("Request not found.", 404);
    const clientAction =
      input.action === "accept" || input.action === "decline";
    if (clientAction) {
      // The client decides on the quote of their own website (owner may act for them).
      if (!owner && (viewer.role !== "client" || item.siteId !== siteId))
        throw new StoreError("Request not found.", 404);
      if (item.status !== "quoted")
        throw new StoreError("This request has no price yet.", 409);
      item.status = input.action === "accept" ? "accepted" : "declined";
      if (item.status === "accepted") toInvoice = item;
    } else if (input.action === "done") {
      if (
        !owner &&
        !(viewer.role === "designer" && item.designerId === viewer.id)
      )
        throw new StoreError("Request not found.", 404);
      item.status = "done";
    } else {
      if (!owner)
        throw new StoreError("Only the super admin can do this.", 403);
      if (input.action === "quote") {
        if (input.price === undefined) throw new StoreError("Enter a price.");
        item.price = input.price;
        item.quoteNote = input.quoteNote || "";
        item.status = "quoted";
      } else item.designerId = input.designerId || undefined;
    }
    item.updatedAt = new Date().toISOString();
    return item;
  });
  if (toInvoice) {
    const invoice = await invoiceChange({
      companyId: toInvoice.companyId,
      siteId: toInvoice.siteId,
      description: `Change request #${toInvoice.number}: ${toInvoice.text.slice(0, 120)}`,
      amount: toInvoice.price || 0,
    });
    await store((data) => {
      const item = data.items.find((r) => r.id === toInvoice!.id);
      if (item) item.invoiceId = invoice.id;
    });
    await notifyTeam({
      kind: "order-action",
      title: `Change request #${toInvoice.number} accepted`,
      text: `The client accepted ${toInvoice.price} EUR. Invoice ${invoice.number} issued — schedule the work.`,
      href: "/dashboard/orders?tab=requests",
    });
  }
  return result;
}
