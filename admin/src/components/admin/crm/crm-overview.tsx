"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { money, type OverviewData } from "@/lib/builder/crm/shared";
import { cn } from "@/lib/utils";
import { card } from "./crm-ui";
import { CRM_CHANGED, crmRequest, formatDate } from "./use-crm";

const dot: Record<string, string> = {
  enquiry: "bg-sky-500",
  order: "bg-emerald-500",
  deal: "bg-violet-500",
  task: "bg-amber-500",
  event: "bg-neutral-300",
};

// Today on the selected website, for the dashboard Overview (owner and clients).
export function CrmOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      crmRequest<OverviewData>("/api/builder/crm/overview")
        .then((d) => live && (setData(d), setError("")))
        .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load today's figures."));
    void load();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void load(), 60000);
    window.addEventListener(CRM_CHANGED, load);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener(CRM_CHANGED, load);
    };
  }, []);
  if (error) return <p className="mb-6 text-sm text-red-600">{error}</p>;
  const tiles = data
    ? [
        { label: "New enquiries", value: String(data.enquiries), note: "today", href: "/dashboard/crm" },
        ...(data.shop
          ? [
              {
                label: "New orders",
                value: String(data.orders),
                note: Object.entries(data.revenue)
                  .map(([c, v]) => money(v, c))
                  .join(" · ") || "today",
                href: "/dashboard/shop-orders",
              },
            ]
          : []),
        { label: "Open deals", value: money(data.openValue, data.currency), note: `${data.openDeals} deal${data.openDeals === 1 ? "" : "s"}`, href: "/dashboard/crm/pipeline" },
        {
          label: "Tasks due",
          value: String(data.tasksDue),
          note: data.overdue ? `${data.overdue} overdue` : "today",
          href: "/dashboard/crm/tasks",
          alert: data.overdue > 0,
        },
        { label: "Visitors", value: data.visitors === null ? "—" : String(data.visitors), note: "today", href: "/dashboard/analytics" },
      ]
    : [];
  return (
    <section className="mb-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Today</h2>
        {data && <span className="text-xs text-neutral-500">{formatDate(`${data.today}T12:00:00Z`, "UTC")}</span>}
      </div>
      <div className={cn("grid gap-5 sm:grid-cols-2", tiles.length > 4 ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
        {(data ? tiles : Array.from({ length: 4 }, () => null)).map((tile, i) =>
          tile ? (
            <Link key={tile.label} href={tile.href} className={`${card} block p-5 transition-colors hover:bg-neutral-50`}>
              <p className="text-xs text-neutral-500">{tile.label}</p>
              <p className="mt-4 text-2xl font-semibold tracking-[-0.03em]">{tile.value}</p>
              <p className={cn("mt-1 text-xs", "alert" in tile && tile.alert ? "font-medium text-red-600" : "text-neutral-400")}>{tile.note}</p>
            </Link>
          ) : (
            <div key={i} className={`${card} h-[118px] animate-pulse`} />
          ),
        )}
      </div>
      {data && (
        <div className={`${card} mt-5 p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Latest activity</h3>
            <Link href="/dashboard/crm" className="flex items-center gap-1 text-xs text-neutral-500 hover:text-black">
              Contacts <ArrowRight className="size-3" />
            </Link>
          </div>
          {!data.activity.length && <p className="text-sm text-neutral-500">Nothing yet. Enquiries, orders and notes will show up here.</p>}
          <ol className="space-y-3">
            {data.activity.map((item, i) => (
              <li key={i} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-3 text-sm">
                <span className={cn("mt-1.5 size-2 rounded-full", dot[item.kind])} />
                <span className="min-w-0">
                  {item.href ? (
                    <Link href={item.href} className="hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                  {item.text && <span className="block truncate text-xs text-neutral-500">{item.text}</span>}
                </span>
                <span className="whitespace-nowrap text-xs text-neutral-400">{formatDate(item.at, data.timeZone, true)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
