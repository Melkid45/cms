"use client";
// Shared pieces of the public order flow (/order and /order/[id]).
import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { BrandLogo } from "@/components/admin/brand-logo";
import { Button } from "@/components/ui/button";

export type OrderStatus =
  | "interview"
  | "submitted"
  | "confirmed"
  | "in-progress"
  | "review"
  | "live"
  | "cancelled";
export interface ClientOrder {
  id: string;
  number: number;
  status: OrderStatus;
  contact: { name: string; email: string; phone: string };
  answers: Record<string, string>;
  files: { id: string; name: string; size: number }[];
  brief: string;
  plan?: "monthly" | "yearly";
  pack?: "standard" | "designer";
  dueAt?: string;
  siteId?: string;
  createdAt: string;
}
export interface Prices {
  currency: string;
  standard: { fee: number; hours: number };
  designer: { fee: number; hours: number };
  monthly: number;
  yearly: number;
}
export type Pack = "standard" | "designer";
export type Plan = "monthly" | "yearly";
export interface OrderKey {
  id: string;
  token: string;
}

// The browser keeps the order key so a reload continues the same order.
const STORAGE_KEY = "harbstone-order";
export function loadKey(): OrderKey | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<OrderKey>;
    return typeof value.id === "string" && typeof value.token === "string"
      ? { id: value.id, token: value.token }
      : null;
  } catch {
    return null;
  }
}
export function saveKey(key: OrderKey | null) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, JSON.stringify(key));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode): the order still works for this visit.
  }
}

export class OrderApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
// Fetch helper for the public order API (token goes in the x-order-token header).
export async function orderApi<T>(
  path: string,
  init: {
    method?: string;
    token?: string;
    json?: unknown;
    body?: BodyInit;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.token) headers["x-order-token"] = init.token;
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method || "GET",
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      cache: "no-store",
    });
  } catch {
    throw new OrderApiError(
      "No connection. Check your internet and try again.",
      0,
    );
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok)
    throw new OrderApiError(
      data.error || "Something went wrong. Please try again.",
      response.status,
    );
  return data as T;
}

export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export const orderLink = (key: OrderKey) =>
  `${window.location.origin}/order/${key.id}#t=${encodeURIComponent(key.token)}`;

export function OrderHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 bg-[#f6f5f2]/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/order" aria-label="Harbstone" className="text-[#111]">
          <BrandLogo className="h-6 w-auto" />
        </Link>
        {right}
      </div>
    </header>
  );
}

// Page frame: light warm background and the Inter type of the public sites.
export function OrderFrame({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-[#f6f5f2] text-[#161616] print:bg-white"
      style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}
    >
      <OrderHeader right={right} />
      <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-24 sm:px-6">
        {children}
      </main>
    </div>
  );
}

function downloadBrief(brief: string, name: string) {
  const blob = new Blob([brief], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Readable brief card with download and print actions.
export function BriefCard({ order }: { order: ClientOrder }) {
  const file = `brief-order-${order.number}.txt`;
  return (
    <section
      data-brief
      className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] sm:p-7 print:p-0 print:shadow-none"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">
          Website brief
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => downloadBrief(order.brief, file)}
          >
            <Download /> Download brief
          </Button>
          <Button variant="secondary" size="lg" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>
      <pre className="max-h-[60vh] overflow-auto rounded-xl bg-[#f6f5f2] p-4 font-[inherit] text-[0.9rem] leading-relaxed break-words whitespace-pre-wrap print:max-h-none print:overflow-visible print:bg-white print:p-0">
        {order.brief}
      </pre>
    </section>
  );
}

export const statusSteps: {
  status: OrderStatus;
  label: string;
  text: string;
}[] = [
  {
    status: "interview",
    label: "Interview",
    text: "You answer a few questions about your business.",
  },
  {
    status: "submitted",
    label: "Brief ready",
    text: "We prepared the brief. Check it and confirm.",
  },
  {
    status: "confirmed",
    label: "Confirmed",
    text: "The team received your order.",
  },
  {
    status: "in-progress",
    label: "In progress",
    text: "We are building the first version of your website.",
  },
  {
    status: "review",
    label: "Review",
    text: "The first version is ready for your feedback.",
  },
  { status: "live", label: "Live", text: "Your website is online." },
];
