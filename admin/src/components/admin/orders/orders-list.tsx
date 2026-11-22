"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronRight } from "lucide-react";
import { useAccess } from "@/components/admin/access-context";
import { cn } from "@/lib/utils";
import { Toolbar, chip, rowLine, subPanel } from "@/components/admin/admin-panel";
import {
  api,
  formatDate,
  isOverdue,
  StatusPill,
  statusLabel,
  type TeamAccount,
  type TeamOrder,
} from "./shared";

type Filter = "all" | "action" | "new" | "progress" | "live" | "interview";
const filters: { id: Filter; label: string; ownerOnly?: boolean }[] = [
  { id: "all", label: "All" },
  { id: "action", label: "Needs action" },
  { id: "new", label: "New" },
  { id: "progress", label: "In progress" },
  { id: "live", label: "Live" },
  { id: "interview", label: "Unfinished interviews", ownerOnly: true },
];
const matches = (order: TeamOrder, filter: Filter) => {
  if (filter === "interview") return order.status === "interview";
  if (order.status === "interview") return false;
  if (filter === "action") return !!order.needsAction;
  if (filter === "new")
    return order.status === "submitted" || order.status === "confirmed";
  if (filter === "progress")
    return order.status === "in-progress" || order.status === "review";
  if (filter === "live") return order.status === "live";
  return true;
};

export function OrdersList({
  designers,
  lead,
}: {
  designers: TeamAccount[];
  lead?: React.ReactNode;
}) {
  const { isOwner, id: viewerId } = useAccess();
  const [orders, setOrders] = useState<TeamOrder[] | null>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState<Filter>("all");
  useEffect(() => {
    let active = true;
    api<TeamOrder[]>("/api/builder/orders")
      .then((data) => active && setOrders(data))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  const designerName = (id?: string) =>
    !id
      ? ""
      : id === viewerId
        ? "You"
        : designers.find((d) => d.id === id)?.name || "Designer";
  const count = (f: Filter) =>
    orders?.filter((order) => matches(order, f)).length ?? 0;
  const shown = orders?.filter((order) => matches(order, filter)) ?? [];

  return (
    <div>
      <Toolbar>
        {lead}
        {filters
          .filter((f) => isOwner || !f.ownerOnly)
          .map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                chip(filter === f.id),
                "px-3",
                filter !== f.id &&
                  (f.id === "interview"
                    ? "text-neutral-400"
                    : f.id === "action" && count("action")
                      ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                      : ""),
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{count(f.id)}</span>
            </button>
          ))}
      </Toolbar>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {orders && !shown.length && (
        <p className={cn(subPanel, "p-10 text-center text-sm text-neutral-500")}>
          {orders.length
            ? "No orders in this view."
            : isOwner
              ? "No website orders yet. They appear here when a client finishes the interview."
              : "No orders are assigned to you yet."}
        </p>
      )}
      <div className="space-y-3">
        {shown.map((order) => {
          const overdue = isOverdue(order);
          return (
            <Link
              key={order.id}
              href={`/dashboard/orders/${order.id}`}
              className={cn(
                rowLine,
                "block py-4",
                order.status === "interview" && "opacity-70",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-neutral-400">
                      #{order.number}
                    </span>
                    <h3 className="min-w-0 truncate font-semibold">
                      {order.answers.business || "Unnamed business"}
                    </h3>
                    <StatusPill
                      status={order.status}
                      label={statusLabel[order.status]}
                    />
                  </div>
                  <p className="mt-1 truncate text-sm text-neutral-500">
                    {order.contact.name || "No contact yet"}
                    {order.contact.email && ` · ${order.contact.email}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    {order.pack && (
                      <span>
                        {order.pack === "designer"
                          ? "Designer pack"
                          : "Standard pack"}
                      </span>
                    )}
                    {order.plan && (
                      <span className="capitalize">{order.plan} hosting</span>
                    )}
                    {order.designerId ? (
                      <span>Designer: {designerName(order.designerId)}</span>
                    ) : (
                      order.status !== "interview" && (
                        <span className="text-neutral-400">No designer</span>
                      )
                    )}
                    {order.dueAt && (
                      <span
                        className={cn(overdue && "font-medium text-red-600")}
                      >
                        Due {formatDate(order.dueAt)}
                        {overdue && " · overdue"}
                      </span>
                    )}
                    {!order.dueAt && (
                      <span>Created {formatDate(order.createdAt)}</span>
                    )}
                  </div>
                  {order.needsAction && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      <span className="min-w-0 break-words">
                        <strong className="font-semibold">Needs action:</strong>{" "}
                        {order.needsAction}
                      </span>
                    </p>
                  )}
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-neutral-300" />
              </div>
            </Link>
          );
        })}
      </div>
      {!orders && !error && (
        <p className="text-sm text-neutral-400">Loading orders…</p>
      )}
    </div>
  );
}
