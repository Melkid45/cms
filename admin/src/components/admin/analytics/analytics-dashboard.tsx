"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, RotateCcw } from "lucide-react";
import { AdminPanel } from "@/components/admin/admin-panel";
import { useAccess } from "../access-context";
import { useWorkspace } from "../site-context";
import { switchSite } from "../site-switcher";
import { Button } from "@/components/ui/button";
import { Select, SelectOption } from "@/components/ui/select";
import { withSite } from "@/lib/builder/site-client";
import { cn } from "@/lib/utils";
import type { AnalyticsReport, Totals } from "@/lib/builder/analytics";
import {
  ExportButton,
  exportPages,
  exportSeries,
  Funnels,
  Goals,
  LiveNow,
  PageInsights,
  WeeklyReportCard,
} from "./analytics-extras";

// Website analytics (BUILDER.md → Analytics): first-party counters from the public pages
// plus enquiries from the inbox. One accent colour, no gridlines, numbers in plain ink.
const ACCENT = "#2f5bd3";
const card =
  "rounded-2xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_rgb(0_0_0/0.04)]";
const periods = [7, 30, 90] as const;
type Metric = "visitors" | "views" | "enquiries" | "orders" | "actions";
const metrics: { key: Metric; label: string }[] = [
  { key: "visitors", label: "Visitors" },
  { key: "views", label: "Page views" },
  { key: "enquiries", label: "Enquiries" },
  { key: "orders", label: "Orders" },
  { key: "actions", label: "Contact actions" },
];
const actionLabels: Record<string, string> = {
  phone: "Phone clicks",
  email: "Email clicks",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  calculator: "Calculator opened",
};
const number = (value: number) => value.toLocaleString("en-GB");
const percent = (value: number) =>
  `${value.toLocaleString("en-GB", { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
function duration(ms: number) {
  if (!ms) return "—";
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
const conversion = (t: Pick<Totals, "enquiries" | "visitors">) =>
  t.visitors ? (t.enquiries / t.visitors) * 100 : 0;
const orderConversion = (t: Pick<Totals, "orders" | "visitors">) =>
  t.visitors ? (t.orders / t.visitors) * 100 : 0;
// Revenue per currency, e.g. "1 240 €" or "1 240 € + 80 $".
const revenueText = (revenue: Record<string, number>) =>
  Object.entries(revenue)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, v]) => `${v.toLocaleString("en-GB", { maximumFractionDigits: v < 100 ? 2 : 0 })} ${currency}`)
    .join(" + ") || "0";
const mainRevenue = (revenue: Record<string, number>) => Math.max(0, ...Object.values(revenue));
const shortDate = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
function displayName(type: "region" | "language", code: string) {
  if (code === "Unknown" || code === "Other") return code;
  try {
    return new Intl.DisplayNames(["en"], { type }).of(type === "region" ? code.toUpperCase() : code) || code;
  } catch {
    return code;
  }
}

export function AnalyticsDashboard() {
  const { isOwner } = useAccess();
  const workspace = useWorkspace();
  const pathname = usePathname();
  const [days, setDays] = useState<(typeof periods)[number]>(30);
  const [metric, setMetric] = useState<Metric>("visitors");
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(withSite(`/api/builder/analytics?days=${days}`), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) {
          setReport(data);
          setError("");
        }
      })
      .catch((e) => active && setError(e.message || "Could not load analytics."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [days, version]);
  const reload = () => {
    setLoading(true);
    setVersion((v) => v + 1);
  };
  async function reset() {
    if (
      !window.confirm(
        `Delete all analytics of ${workspace?.site?.name || "this website"}? Enquiries in the inbox are kept.`,
      )
    )
      return;
    const response = await fetch(withSite("/api/builder/analytics"), {
      method: "DELETE",
    });
    if (!response.ok)
      setError((await response.json()).error || "Could not reset analytics.");
    reload();
  }
  const sites = workspace?.sites || [];
  const t = report?.totals;
  const p = report?.previous;
  const shop = !!report?.shop;
  const avg = (x: Totals) => (x.timed ? x.time / x.timed : 0);
  // With a shop: three rows of three (traffic, enquiries, orders).
  const tiles = t &&
    p && [
      { label: "Visitors", value: number(t.visitors), cur: t.visitors, prev: p.visitors, hint: "Unique visitors per day, summed" },
      { label: "Page views", value: number(t.views), cur: t.views, prev: p.views, hint: `${number(t.visits)} visits` },
      ...(shop ? [{ label: "Avg. time on page", value: duration(avg(t)), cur: avg(t), prev: avg(p), hint: "Time the page was visible" }] : []),
      { label: "Enquiries", value: number(t.enquiries), cur: t.enquiries, prev: p.enquiries, hint: "Forms sent from the website" },
      {
        label: "Enquiry conversion",
        value: percent(conversion(t)),
        cur: conversion(t),
        prev: conversion(p),
        points: true,
        hint: "Enquiries ÷ visitors",
      },
      { label: "Contact actions", value: number(t.actions), cur: t.actions, prev: p.actions, hint: "Phone, email, messengers, calculator" },
      ...(shop
        ? [
            { label: "Orders", value: number(t.orders), cur: t.orders, prev: p.orders, hint: "Shop orders, without cancelled" },
            { label: "Revenue", value: revenueText(t.revenue), cur: mainRevenue(t.revenue), prev: mainRevenue(p.revenue), hint: "Total of these orders" },
            {
              label: "Order conversion",
              value: percent(orderConversion(t)),
              cur: orderConversion(t),
              prev: orderConversion(p),
              points: true,
              hint: "Orders ÷ visitors",
            },
          ]
        : [{ label: "Avg. time on page", value: duration(avg(t)), cur: avg(t), prev: avg(p), hint: "Time the page was visible" }]),
    ];
  const chartMetrics = metrics.filter((m) => shop || m.key !== "orders");
  return (
    <AdminPanel
      title="Analytics"
      className="min-w-0"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
            {sites.length > 1 && (
              <Select
                aria-label="Website"
                className="h-9 w-48 shrink-0 bg-white"
                value={workspace?.site?.id || ""}
                onValueChange={(id) => id !== workspace?.site?.id && switchSite(id, pathname)}
              >
                {sites.map((site) => (
                  <SelectOption key={site.id} value={site.id}>
                    {site.name}
                  </SelectOption>
                ))}
              </Select>
            )}
            <div className="flex shrink-0 rounded-lg bg-white p-0.5 shadow-[0_1px_2px_rgb(0_0_0/0.06)]" role="group" aria-label="Period">
              {periods.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={days === value}
                  onClick={() => {
                    setLoading(true);
                    setDays(value);
                  }}
                  className={cn(
                    "h-8 shrink-0 rounded-md px-3 text-sm whitespace-nowrap text-neutral-500 transition-colors hover:text-black",
                    days === value && "bg-neutral-900 text-white hover:text-white",
                  )}
                >
                  {value} days
                </button>
              ))}
            </div>
            <Button variant="outline" size="icon" aria-label="Refresh" onClick={reload} className="size-9 bg-white">
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          </div>
        }</div>}
    >
      {error && (
        <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
      <div className="mb-5">
        <LiveNow siteId={workspace?.site?.id} />
      </div>
      {!report && !error && <p className="text-sm text-neutral-500">Loading…</p>}
      {report && t && p && tiles && (
        <div className={cn("flex flex-col gap-5 transition-opacity", loading && "opacity-60")}>
          {!report.collecting && (
            <p className="rounded-xl bg-white px-4 py-3 text-sm text-neutral-600">
              No visits recorded in this period yet. Counting starts automatically when people open the published pages; your own visits while signed in are not counted.
            </p>
          )}
          <section className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", !shop && "xl:grid-cols-6")}>
            {tiles.map((tile) => (
              <div key={tile.label} className={cn(card, "min-w-0 p-4 sm:p-5")}>
                <p className="text-xs font-medium text-neutral-500">{tile.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-[1.75rem]">{tile.value}</p>
                <Delta cur={tile.cur} prev={tile.prev} points={tile.points} />
                <p className="mt-1 text-[11px] leading-snug text-neutral-400">{tile.hint}</p>
              </div>
            ))}
          </section>

          <section className={cn(card, "p-4 sm:p-6")}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{chartMetrics.find((m) => m.key === metric)?.label || "Visitors"} by day</h2>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {shortDate(report.from)} – {shortDate(report.to)} · time zone {report.timeZone}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
              <ExportButton label="CSV" onClick={() => exportSeries(report, workspace?.site?.key || "site")} />
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Chart metric">
                {chartMetrics.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={metric === m.key}
                    onClick={() => setMetric(m.key)}
                    className={cn(
                      "h-8 rounded-md px-2.5 text-xs whitespace-nowrap text-neutral-500 hover:bg-neutral-100 hover:text-black",
                      metric === m.key && "bg-neutral-100 font-medium text-black",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              </div>
            </div>
            <DayChart series={report.series} metric={shop || metric !== "orders" ? metric : "visitors"} metrics={chartMetrics} />
          </section>

          <Funnels report={report} />
          <Goals report={report} onChange={reload} />

          <section className={cn(card, "min-w-0 overflow-hidden")}>
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-5 pb-3 sm:px-6">
              <div>
              <h2 className="text-sm font-semibold">Pages</h2>
              <p className="mt-0.5 text-xs text-neutral-400">
                {shop
                  ? "Views, visitors and enquiries of each page; orders and revenue of the products on that page"
                  : "Views, visitors and enquiries sent from each page"}
              </p>
              </div>
              <ExportButton label="Export CSV" onClick={() => exportPages(report, workspace?.site?.key || "site")} />
            </div>
            <div className="overflow-x-auto">
              <table className={cn("w-full text-sm", shop ? "min-w-[860px]" : "min-w-[620px]")}>
                <thead>
                  <tr className="text-left text-xs text-neutral-400">
                    <th className="px-4 py-2 font-medium sm:pl-6">Page</th>
                    <th className="px-3 py-2 text-right font-medium">Views</th>
                    <th className="px-3 py-2 text-right font-medium">Visitors</th>
                    <th className="px-3 py-2 text-right font-medium">Enquiries</th>
                    <th className="px-3 py-2 text-right font-medium">Enquiry conv.</th>
                    {shop && <th className="px-3 py-2 text-right font-medium">Orders</th>}
                    {shop && <th className="px-3 py-2 text-right font-medium">Revenue</th>}
                    {shop && <th className="px-3 py-2 text-right font-medium">Order conv.</th>}
                    <th className="px-3 py-2 text-right font-medium">Contact actions</th>
                    <th className="px-4 py-2 text-right font-medium sm:pr-6">Avg. time</th>
                  </tr>
                </thead>
                <tbody>
                  {report.pages.length === 0 && (
                    <tr>
                      <td colSpan={shop ? 10 : 7} className="px-4 py-6 text-neutral-400 sm:px-6">No page views yet.</td>
                    </tr>
                  )}
                  {report.pages.map((page, index) => (
                    <tr key={page.id} className={cn(index % 2 === 0 && "bg-neutral-50/70")}>
                      <td className="max-w-[260px] px-4 py-2.5 sm:pl-6">
                        <p className="truncate font-medium">{page.title}</p>
                        {page.slug && <p className="truncate text-xs text-neutral-400">/{page.slug}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{number(page.views)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{number(page.visitors)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{number(page.enquiries)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {page.visitors ? percent((page.enquiries / page.visitors) * 100) : "—"}
                      </td>
                      {shop && <td className="px-3 py-2.5 text-right tabular-nums">{number(page.orders)}</td>}
                      {shop && <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{page.orders ? revenueText(page.revenue) : "—"}</td>}
                      {shop && (
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {page.visitors ? percent((page.orders / page.visitors) * 100) : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right tabular-nums">{number(page.actions)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums sm:pr-6">
                        {duration(page.timed ? page.time / page.timed : 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <PageInsights report={report} days={days} />

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Breakdown title="Sources" note="Where visits came from" rows={report.sources} />
            <Breakdown
              title="Contact actions"
              note="Clicks on phone, email and messenger links"
              rows={report.actions.map((r) => ({ key: actionLabels[r.key] || r.key, value: r.value }))}
              keepZero
            />
            <Breakdown title="Campaigns" note="utm_source / utm_medium / utm_campaign" rows={report.utm} empty="No links with UTM tags yet." />
            <Breakdown title="Devices" note="Unique visitors" rows={report.devices} />
            <Breakdown
              title="Countries"
              note="From the hosting network, unique visitors"
              rows={report.countries.map((r) => ({ ...r, key: displayName("region", r.key) }))}
            />
            <Breakdown
              title="Languages"
              note="Browser language, unique visitors"
              rows={report.languages.map((r) => ({ ...r, key: displayName("language", r.key) }))}
            />
          </section>

          <WeeklyReportCard isOwner={isOwner} weekly={report.weekly} onChange={reload} />

          <div className="flex flex-col gap-3 pb-2 text-xs leading-relaxed text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl">
              Privacy: no cookies and no personal data. A visitor is recognised only within one day by an anonymous code that changes every day, so no consent banner is needed. Bots and signed-in CMS users are not counted.
            </p>
            {isOwner && (
              <Button variant="ghost" size="sm" onClick={reset} className="self-start text-neutral-500 hover:text-red-600">
                <RotateCcw data-icon="inline-start" /> Reset analytics for this website
              </Button>
            )}
          </div>
        </div>
      )}
    </AdminPanel>
  );
}

function Delta({ cur, prev, points }: { cur: number; prev: number; points?: boolean }) {
  if (!cur && !prev) return <p className="mt-1 text-xs text-neutral-400">No data</p>;
  let text: string;
  let up = cur >= prev;
  if (points) {
    const diff = cur - prev;
    up = diff >= 0;
    text = `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pp`;
  } else if (!prev) text = "New";
  else {
    const change = ((cur - prev) / prev) * 100;
    text = `${change >= 0 ? "+" : "−"}${Math.abs(Math.round(change))}%`;
  }
  return (
    <p className="mt-1 text-xs">
      <span className={cn("font-medium", up ? "text-emerald-700" : "text-neutral-600")}>
        {up ? "↑" : "↓"} {text}
      </span>
      <span className="text-neutral-400"> vs previous</span>
    </p>
  );
}

function Breakdown({
  title,
  note,
  rows,
  empty = "No data yet.",
  keepZero = false,
}: {
  title: string;
  note: string;
  rows: { key: string; value: number }[];
  empty?: string;
  keepZero?: boolean;
}) {
  const list = keepZero ? rows : rows.filter((r) => r.value > 0);
  const total = list.reduce((sum, r) => sum + r.value, 0);
  const max = Math.max(1, ...list.map((r) => r.value));
  return (
    <div className={cn(card, "min-w-0 p-4 sm:p-6")}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 mb-4 text-xs text-neutral-400">{note}</p>
      {list.length === 0 || (!total && !keepZero) ? (
        <p className="text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.slice(0, 10).map((row) => (
            <li key={row.key} className="relative flex min-h-8 items-center justify-between gap-3 overflow-hidden rounded-md px-2.5 text-sm">
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-md"
                style={{ width: `${(row.value / max) * 100}%`, background: ACCENT, opacity: 0.1 }}
              />
              <span className="relative min-w-0 truncate">{row.key}</span>
              <span className="relative shrink-0 tabular-nums text-neutral-600">
                {number(row.value)}
                {total > 0 && <span className="ml-2 text-xs text-neutral-400">{Math.round((row.value / total) * 100)}%</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Single-series area chart in plain SVG, sized to its container; hover shows the day's numbers.
function DayChart({
  series,
  metric,
  metrics,
}: {
  series: AnalyticsReport["series"];
  metric: Metric;
  metrics: { key: Metric; label: string }[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  const height = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 36 };
  const values = series.map((d) => d[metric]);
  const rawMax = Math.max(...values, 0);
  const step = niceStep(rawMax);
  const max = Math.max(step * Math.ceil(rawMax / step), step);
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (series.length > 1 ? (i / (series.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(values.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(innerW / 80))));
  const active = hover !== null ? series[hover] : null;
  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientX - rect.left - pad.left;
    const index = Math.round((position / Math.max(1, innerW)) * (series.length - 1));
    setHover(Math.min(series.length - 1, Math.max(0, index)));
  }
  return (
    <div ref={box} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block touch-pan-y"
          role="img"
          aria-label={`${metric} by day`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <text key={tick} x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-neutral-400 text-[11px] tabular-nums">
              {number(Math.round(tick))}
            </text>
          ))}
          <path d={area} fill={ACCENT} opacity={0.1} />
          <path d={line} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {series.map((d, i) =>
            (i % labelEvery === 0 && series.length - 1 - i >= labelEvery * 0.8) ||
            i === series.length - 1 ? (
                <text key={d.date} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="fill-neutral-400 text-[11px]">
                  {shortDate(d.date)}
                </text>
            ) : null,
          )}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(0)} stroke="#a3a3a3" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(values[hover])} r={5} fill={ACCENT} stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.min(Math.max(0, x(hover) - 88), Math.max(0, width - 176)) }}
        >
          <p className="mb-1 font-medium">{shortDate(active.date)}</p>
          {metrics.map((m) => (
            <p key={m.key} className={cn("flex justify-between gap-3", m.key !== metric && "text-white/70")}>
              <span>{m.label}</span>
              <span className="tabular-nums">{number(active[m.key])}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
function niceStep(max: number) {
  if (max <= 4) return 2;
  const rough = max / 2;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 2.5, 5, 10].find((n) => n * power >= rough) || 10;
  return unit * power;
}
