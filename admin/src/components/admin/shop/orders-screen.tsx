"use client";
import { paymentLabels } from "@/lib/builder/payments-shared";
import { Select, SelectOption } from "@/components/ui/select";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Truck,
  PackageCheck,
  X,
  Mail,
  RefreshCw,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { withSite } from "@/lib/builder/site-client";
import { useProject } from "@/lib/builder/client";
import { useAccess } from "@/components/admin/access-context";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
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
  async function patch(
    order: ShopOrder,
    change: {
      status?: ShopStatus;
      note?: string;
      paymentStatus?: "paid" | "unpaid";
    },
  ) {
    setBusy(order.id);
    setError("");
    try {
      const response = await fetch(withSite("/api/builder/shop-orders"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          revision: order.revision,
          ...change,
        }),
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
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the order.");
    } finally {
      setBusy("");
    }
  }
  async function retry(
    order: ShopOrder,
    target: "shop" | "buyer",
    retryUncertain = false,
  ) {
    if (
      retryUncertain &&
      !confirm(
        "The previous sending result is unknown. Check your mail provider first. Sending again may create a duplicate. Continue?",
      )
    )
      return;
    setBusy(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(withSite("/api/builder/shop-orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, target, retryUncertain }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOrders((all) => all.map((o) => (o.id === data.id ? data : o)));
      const state = target === "shop" ? data.email : data.buyerEmail;
      setNotice(
        state === "sent"
          ? "Email accepted by the mail server."
          : state === "failed"
            ? "Email failed. Check SMTP settings before retrying."
            : "Email not sent. Check SMTP, the recipient and notification settings.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send email.");
    } finally {
      setBusy("");
    }
  }
  const shown = orders.filter(
    (o) =>
      (!filter || o.status === filter) &&
      `${o.number} ${o.customer.name} ${o.customer.email} ${o.customer.phone}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const opened = orders.find((o) => o.id === selected);
  const zone = project?.website?.timeZone || "UTC";
  return (
    <AdminPanel
      title="Shop orders"
      toolbar={
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw />
              Refresh
            </Button>
          }
        </div>
      }
    >
      {selected && (
        <Button
          variant="ghost"
          className="mb-5"
          onClick={() => {
            setSelected(null);
            setNotice("");
          }}
        >
          <ArrowLeft />
          All orders
        </Button>
      )}
      {!selected && (
        <Input
          className="mb-4 max-w-sm"
          aria-label="Search orders"
          placeholder="Search number, customer or contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {!selected && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Button
            aria-pressed={!filter}
            variant={filter ? "ghost" : "secondary"}
            onClick={() => setFilter("")}
          >
            All ({orders.length})
          </Button>
          {STATUSES.map((s) => (
            <Button
              key={s.value}
              aria-pressed={filter === s.value}
              variant={filter === s.value ? "secondary" : "ghost"}
              onClick={() => setFilter(s.value)}
            >
              {s.label} ({orders.filter((o) => o.status === s.value).length})
            </Button>
          ))}
        </div>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-neutral-100 p-3 text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-red-600">
          {error}
        </p>
      )}
      {!selected && shown.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                {["Order", "Customer", "Status", "Total", "Placed"].map((h) => (
                  <th key={h} className="p-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((order) => (
                <tr
                  key={order.id}
                  className="border-t border-neutral-100 hover:bg-neutral-50"
                >
                  <td className="p-4">
                    <button
                      className="font-medium underline-offset-4 hover:underline"
                      onClick={() => {
                        setSelected(order.id);
                        setNotice("");
                      }}
                    >
                      Order #{order.number}
                    </button>
                    <span className="mt-1 block text-xs text-neutral-500">
                      {order.items.reduce((n, i) => n + i.qty, 0)} items
                    </span>
                  </td>
                  <td className="p-4">
                    {order.customer.name}
                    <span className="block text-xs text-neutral-500">
                      {order.customer.email || order.customer.phone}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs">
                      {STATUSES.find((s) => s.value === order.status)?.label}
                    </span>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {money(order.total ?? order.subtotal, order.currency)}
                  </td>
                  <td className="p-4 whitespace-nowrap text-neutral-500">
                    {new Date(order.createdAt).toLocaleDateString("en-GB", {
                      timeZone: zone,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="space-y-4">
        {(opened ? [opened] : []).map((order) => (
          <article key={order.id} className="rounded-xl border bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <ShoppingCart className="size-5" />
              <h2 className="flex-1 font-medium">
                Order #{order.number} ·{" "}
                {money(order.total ?? order.subtotal, order.currency)}
              </h2>
              <span className="text-xs text-neutral-500">
                {new Date(order.createdAt).toLocaleString("en-GB", {
                  timeZone: zone,
                })}
              </span>
              <div className="w-40">
                <Select
                  aria-label={`Status of order ${order.number}`}
                  className="h-9 "
                  value={String(order.status)}
                  disabled={busy === order.id}
                  onValueChange={(selectedValue) =>
                    void patch(order, { status: selectedValue as ShopStatus })
                  }
                >
                  {STATUSES.map((s) => (
                    <SelectOption key={s.value} value={String(s.value)}>
                      {s.label}
                    </SelectOption>
                  ))}
                </Select>
              </div>
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
            {order.inventory?.allocations.some((item) => item.tracked) && (
              <p className="mb-3 text-xs text-neutral-500">
                {order.inventory.state === "reserved"
                  ? "Stock reserved"
                  : order.inventory.state === "committed"
                    ? "Stock deducted"
                    : "Stock released / returned"}
              </p>
            )}
            <div className="mb-6 flex flex-wrap gap-2">
              {order.status === "new" && (
                <Button
                  disabled={busy === order.id}
                  onClick={() => void patch(order, { status: "confirmed" })}
                >
                  <Check />
                  Confirm order
                </Button>
              )}
              {order.status === "confirmed" && (
                <Button
                  disabled={busy === order.id}
                  onClick={() => void patch(order, { status: "shipped" })}
                >
                  <Truck />
                  Mark dispatched
                </Button>
              )}
              {["confirmed", "shipped"].includes(order.status) && (
                <Button
                  variant="outline"
                  disabled={busy === order.id}
                  onClick={() => void patch(order, { status: "done" })}
                >
                  <PackageCheck />
                  Complete order
                </Button>
              )}
              {!["done", "cancelled"].includes(order.status) && (
                <Button
                  variant="ghost"
                  disabled={busy === order.id}
                  onClick={() => {
                    if (
                      confirm(
                        "Cancel this order and release its reserved stock?",
                      )
                    )
                      void patch(order, { status: "cancelled" });
                  }}
                >
                  <X />
                  Cancel order
                </Button>
              )}
            </div>
            <section className="mb-5 rounded-lg bg-neutral-50 p-4">
              <h3 className="text-sm font-medium">
                Payment · {order.payment?.status || "unpaid"}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                {paymentLabels[order.payment?.method || "on_receipt"]}
                {order.payment?.test ? " · Test payment" : ""}
              </p>
              {order.payment?.needsReview && (
                <p className="mt-2 text-sm text-amber-700">
                  Payment received for a cancelled order. Review the order and
                  arrange a refund through your payment provider.
                </p>
              )}
              {(!order.payment ||
                ["on_receipt", "invoice"].includes(order.payment.method)) && (
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  disabled={busy === order.id}
                  onClick={() => {
                    if (
                      confirm(
                        order.payment?.status === "paid"
                          ? "Mark this order unpaid?"
                          : "Confirm that payment has been received?",
                      )
                    )
                      void patch(order, {
                        paymentStatus:
                          order.payment?.status === "paid" ? "unpaid" : "paid",
                      });
                  }}
                >
                  {order.payment?.status === "paid"
                    ? "Mark unpaid"
                    : "Mark payment received"}
                </Button>
              )}
            </section>
            <table className="mb-4 w-full text-sm">
              <tbody>
                {order.items.map((item, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-3 text-neutral-500">{item.qty} ×</td>
                    <td className="py-1 pr-3">
                      {item.name}
                      {item.sku && (
                        <span className="block text-xs text-neutral-500">
                          SKU: {item.sku}
                        </span>
                      )}
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
              <tfoot className="border-t">
                <tr>
                  <td colSpan={2} className="pt-4 text-neutral-500">
                    Products
                  </td>
                  <td className="pt-4 text-right">
                    {money(order.subtotal, order.currency)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="py-2 text-neutral-500">
                    Delivery
                  </td>
                  <td className="py-2 text-right">
                    {money(order.delivery.price || 0, order.currency)}
                  </td>
                </tr>
                <tr className="font-medium">
                  <td colSpan={2} className="pb-4">
                    Total
                  </td>
                  <td className="pb-4 text-right">
                    {money(order.total ?? order.subtotal, order.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-500">
                  {order.customer.company
                    ? "Company"
                    : order.customer.type === "company"
                      ? "Company"
                      : "Customer"}
                </dt>
                {order.customer.company ? (
                  <dd>
                    {order.customer.company.name ||
                      "Not checked in the register"}
                    <br />
                    <span className="text-xs text-neutral-500">
                      Reg. No. {order.customer.company.reg}
                      {order.customer.company.address &&
                        ` · ${order.customer.company.address}`}
                    </span>
                    <br />
                    Contact: {order.customer.name}
                  </dd>
                ) : (
                  <dd>{order.customer.name}</dd>
                )}
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Contacts</dt>
                <dd>
                  <a
                    href={`tel:${order.customer.phone.replace(/[^+\d]/g, "")}`}
                  >
                    {order.customer.phone}
                  </a>
                  {order.customer.email && (
                    <>
                      <br />
                      <a href={`mailto:${order.customer.email}`}>
                        {order.customer.email}
                      </a>
                    </>
                  )}
                  {order.notify && (
                    <>
                      <br />
                      <span className="text-xs text-neutral-500">
                        Status messages:{" "}
                        {order.notify === "whatsapp" ? "WhatsApp" : "Telegram"}
                      </span>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Delivery</dt>
                <dd>
                  {order.delivery.method === "pickup"
                    ? "Pickup"
                    : `Delivery${order.delivery.zone ? ` · ${order.delivery.zone}` : ""} · ${order.delivery.price ? money(order.delivery.price, order.currency) : "free"}: ${order.delivery.address}${order.delivery.flat ? `, ${order.delivery.flat}` : ""}`}
                  {order.delivery.point && (
                    <>
                      {" · "}
                      <a
                        className="underline"
                        href={`https://www.google.com/maps?q=${order.delivery.point.lat},${order.delivery.point.lon}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        map
                      </a>
                    </>
                  )}
                  {order.via === "popup" && (
                    <span className="block text-xs text-neutral-500">
                      Placed in the checkout popup
                    </span>
                  )}
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
              <div className="sm:col-span-3 mt-3 grid gap-3 sm:grid-cols-2">
                {(["shop", "buyer"] as const).map((target) => {
                  const state =
                    order.mail?.[target]?.state ||
                    (target === "shop" ? order.email : order.buyerEmail) ||
                    "none";
                  const uncertain =
                    state === "sending" &&
                    Date.now() - Date.parse(order.mail![target]!.at) > 120000;
                  return (
                    <div key={target} className="rounded-lg bg-neutral-50 p-4">
                      <p className="flex items-center gap-2 font-medium">
                        <Mail className="size-4" />
                        {target === "shop"
                          ? "Shop notification"
                          : "Buyer confirmation"}
                      </p>
                      <p
                        className={`mt-2 text-xs ${state === "failed" ? "text-red-600" : "text-neutral-500"}`}
                      >
                        {state === "sent"
                          ? "Accepted by mail server"
                          : state === "failed"
                            ? "Sending failed — check SMTP settings"
                            : state === "sending"
                              ? uncertain
                                ? "Sending result unknown — check your mail provider before retrying"
                                : "Sending — refresh for the result"
                              : "Not sent — SMTP or recipient not configured, or disabled"}
                      </p>
                      {order.mail?.[target]?.at && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {new Date(order.mail[target]!.at).toLocaleString(
                            "en-GB",
                            { timeZone: zone },
                          )}
                        </p>
                      )}
                      <a
                        className="mt-3 mr-3 inline-block text-xs underline underline-offset-4"
                        href={withSite(
                          `/api/builder/shop-orders?id=${encodeURIComponent(order.id)}&preview=${target}`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview email
                      </a>
                      {state !== "sent" &&
                        (state !== "sending" || uncertain) && (
                          <Button
                            className="mt-3"
                            size="sm"
                            variant="outline"
                            disabled={
                              busy === order.id ||
                              (target === "buyer" && !order.customer.email)
                            }
                            onClick={() => void retry(order, target, uncertain)}
                          >
                            {state === "failed" ? "Retry email" : "Send email"}
                          </Button>
                        )}
                    </div>
                  );
                })}
              </div>
            </dl>
            <div className="mt-6 border-t pt-5">
              <h3 className="mb-4 text-sm font-medium">Order history</h3>
              <ol className="space-y-3">
                {order.history.map((h, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap justify-between gap-2 text-sm"
                  >
                    <span>
                      {h.kind === "payment"
                        ? `Payment · ${h.paymentStatus || "updated"}`
                        : h.kind === "note"
                          ? "Internal note updated"
                          : STATUSES.find((s) => s.value === h.status)?.label ||
                            h.status}
                    </span>
                    <time className="text-xs text-neutral-500">
                      {new Date(h.at).toLocaleString("en-GB", {
                        timeZone: zone,
                      })}
                    </time>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-6 space-y-2">
              <Textarea
                aria-label={`Internal note for order ${order.number}`}
                rows={2}
                maxLength={4000}
                placeholder="Internal note (not visible to the customer)"
                value={notes[order.id] ?? order.note}
                onChange={(e) =>
                  setNotes((all) => ({ ...all, [order.id]: e.target.value }))
                }
              />
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy === order.id ||
                  notes[order.id] === undefined ||
                  notes[order.id] === order.note
                }
                onClick={() => void patch(order, { note: notes[order.id] })}
              >
                Save note
              </Button>
            </div>
          </article>
        ))}
        {loaded && !selected && !shown.length && (
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
