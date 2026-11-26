"use client";
import type { Order, OrderStatus } from "@/lib/builder/orders";
import type {
  ChangeRequest,
  RequestStatus,
} from "@/lib/builder/change-requests";
import { cn } from "@/lib/utils";
import { toneClass } from "../status-tone";

export type TeamOrder = Omit<Order, "tokenHash">;
export type { ChangeRequest, RequestStatus, OrderStatus };

export interface TeamAccount {
  id: string;
  name: string;
  email: string;
  role?: "client" | "designer";
  disabled?: boolean;
}

// Card surface without hairline borders: soft ring + shadow.
export const card =
  "rounded-[20px] bg-white";
export const field =
  "h-9 w-full min-w-0 rounded-lg bg-white px-3 text-sm shadow-[0_0_0_1px_rgb(0_0_0/0.1)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export const statusLabel: Record<OrderStatus, string> = {
  interview: "Interview",
  submitted: "Submitted",
  confirmed: "Confirmed",
  "in-progress": "In progress",
  review: "Review",
  live: "Live",
  cancelled: "Cancelled",
};
export const requestLabel: Record<RequestStatus, string> = {
  new: "New",
  quoted: "Quoted",
  accepted: "Accepted",
  declined: "Declined",
  done: "Done",
};

// Shared status colours (status-tone.ts): in progress orange, done green, closed grey.
const tone: Record<string, string> = {
  interview: toneClass.progress,
  submitted: toneClass.progress,
  confirmed: toneClass.progress,
  new: toneClass.progress,
  "in-progress": toneClass.progress,
  review: toneClass.progress,
  quoted: toneClass.progress,
  accepted: toneClass.progress,
  live: toneClass.good,
  done: toneClass.good,
  cancelled: toneClass.inactive,
  declined: toneClass.inactive,
};

export function StatusPill({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        tone[status] || "bg-neutral-100 text-neutral-600",
      )}
    >
      {label}
    </span>
  );
}

export const formatDate = (value?: string) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export const isOverdue = (order: TeamOrder) =>
  !!order.dueAt &&
  !["live", "cancelled", "review"].includes(order.status) &&
  new Date(order.dueAt).getTime() < Date.now();

export const money = (value?: number) =>
  value === undefined
    ? ""
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "EUR",
      }).format(value);

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || "Something went wrong.");
  return data as T;
}
