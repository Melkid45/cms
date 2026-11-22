"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShoppingCart, Trash2 } from "lucide-react";
import { withSite } from "@/lib/builder/site-client";
import { useProject } from "@/lib/builder/client";
import { useAccess } from "@/components/admin/access-context";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ShopOrder, ShopStatus } from "@/lib/builder/shop";

// Orders placed on the website's checkout page (pricing-v24). Prices were recomputed by the
// server from the published pages when the order was placed.
const STATUSES: { value: ShopStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "shipped", label: "Shipped" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];
const money = (n: number, currency: string) =>
  `${n.toFixed(2).replace(/\.00$/, "")} ${currency}`;
export default function ShopOrders() {
  const { isOwner } = useAccess();
  const { project } = useProject();
  const [orders, setOrders] = useState<ShopOrder[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [filter, setFilter] = useState<ShopStatus | "">(""),
    [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      const response = await fetch(withSite("/api/builder/shop-orders"), {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOrders(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders.");
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);
  async function patch(order: ShopOrder, change: { status?: ShopStatus; note?: string }) {
    setBusy(order.id);
    setError("");
    try {
      const response = await fetch(withSite("/api/builder/shop-orders"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, revision: order.revision, ...change }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOrders((all) => all.map((o) => (o.id === data.id ? data : o)));
      if (change.note !== undefined)
        setNotes((all) => {
          const next = { ...all };
          delete next[order.id];
          return next;
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the order.");
    } finally {
      setBusy("");
    }
  }
  async function remove(order: ShopOrder) {
    if (!confirm(`Delete order #${order.number} permanently?`)) return;
    setBusy(order.id);
    try {
      const response = await fetch(withSite("/api/builder/shop-orders"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [order.id] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOrders((all) => all.filter((o) => o.id !== order.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the order.");
    } finally {
      setBusy("");
    }
  }
  const shown = orders.filter((o) => !filter || o.status === filter);
  const zone = project?.website?.timeZone || "UTC";
  return (
    <AdminPanel
      title="Shop orders"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw />
            Refresh
          </Button>
        }</div>}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant={filter ? "ghost" : "secondary"} onClick={() => setFilter("")}>
          All ({orders.length})
        </Button>
        {STATUSES.map((s) => (
          <Button
            key={s.value}
            variant={filter === s.value ? "secondary" : "ghost"}
            onClick={() => setFilter(s.value)}
          >
            {s.label} ({orders.filter((o) => o.status === s.value).length})
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-4 text-red-600">
          {error}
        </p>
      )}
      <div className="space-y-4">
        {shown.map((order) => (
          <article key={order.id} className="rounded-xl border bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <ShoppingCart className="size-5" />
              <h2 className="flex-1 font-medium">
                Order #{order.number} · {money(order.total ?? order.subtotal, order.currency)}
              </h2>
              <span className="text-xs text-neutral-500">
                {new Date(order.createdAt).toLocaleString("en-GB", { timeZone: zone })}
              </span>
              <select
                aria-label={`Status of order ${order.number}`}
                className="h-8 rounded-md border bg-white px-2 text-sm"
                value={order.status}
                disabled={busy === order.id}
                onChange={(e) => void patch(order, { status: e.target.value as ShopStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {isOwner && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete order ${order.number}`}
                  disabled={busy === order.id}
                  onClick={() => void remove(order)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <table className="mb-4 w-full text-sm">
              <tbody>
                {order.items.map((item, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-3 text-neutral-500">{item.qty} ×</td>
                    <td className="py-1 pr-3">
                      {item.name}
                      {item.options.length > 0 && (
                        <span className="block text-xs text-neutral-500">
                          {item.options.join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right whitespace-nowrap">
                      {money(item.total, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-500">
                  {order.customer.type === "company" ? "Company" : "Customer"}
                </dt>
                <dd>{order.customer.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Contacts</dt>
                <dd>
                  <a href={`tel:${order.customer.phone.replace(/[^+\d]/g, "")}`}>{order.customer.phone}</a>
                  {order.customer.email && (
                    <>
                      <br />
                      <a href={`mailto:${order.customer.email}`}>{order.customer.email}</a>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Delivery</dt>
                <dd>
                  {order.delivery.method === "pickup"
                    ? "Pickup"
                    : `Delivery${order.delivery.zone ? ` · ${order.delivery.zone}` : ""} · ${order.delivery.price ? money(order.delivery.price, order.currency) : "free"}: ${order.delivery.address}`}
                </dd>
              </div>
              {order.comment && (
                <div className="sm:col-span-3">
                  <dt className="text-xs text-neutral-500">Comment</dt>
                  <dd className="whitespace-pre-wrap">{order.comment}</dd>
                </div>
              )}
              {order.consents.length > 0 && (
                <div className="sm:col-span-3">
                  <dt className="text-xs text-neutral-500">Customer ticked</dt>
                  <dd>{order.consents.join(" · ")}</dd>
                </div>
              )}
              <div className="sm:col-span-3 text-xs text-neutral-500">
                E-mail to the shop:{" "}
                {order.email === "sent" ? "sent" : order.email === "failed" ? "failed (saved here)" : "not configured"}
                {" · "}Confirmation to the buyer:{" "}
                {order.buyerEmail === "sent" ? "sent" : order.buyerEmail === "failed" ? "failed" : "not sent"}
                {" · "}History:{" "}
                {order.history
                  .map((h) => `${h.status} ${new Date(h.at).toLocaleDateString("en-GB", { timeZone: zone })}`)
                  .join(" → ")}
              </div>
            </dl>
            <div className="mt-4 space-y-2">
              <Textarea
                aria-label={`Internal note for order ${order.number}`}
                rows={2}
                maxLength={4000}
                placeholder="Internal note (not visible to the customer)"
                value={notes[order.id] ?? order.note}
                onChange={(e) => setNotes((all) => ({ ...all, [order.id]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy === order.id || notes[order.id] === undefined || notes[order.id] === order.note}
                onClick={() => void patch(order, { note: notes[order.id] })}
              >
                Save note
              </Button>
            </div>
          </article>
        ))}
        {loaded && !shown.length && (
          <div className="rounded-xl border bg-white p-12 text-center text-sm text-neutral-500">
            {orders.length
              ? "No orders with this status."
              : "Orders from your website's checkout page will appear here."}
          </div>
        )}
        {!loaded && <p>Loading orders…</p>}
      </div>
    </AdminPanel>
  );
}
