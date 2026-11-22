"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { withSite } from "@/lib/builder/site-client";
import { cn } from "@/lib/utils";
import type { AnalyticsReport } from "@/lib/builder/analytics";
import type { WeeklyReport } from "@/lib/builder/analytics-weekly";

// Analytics v2 blocks (BUILDER.md → Analytics → v2): live now, funnels, goals, click map with
// scroll depth, weekly report preview, CSV export. Same look as the dashboard: white cards,
// one accent colour, no gridlines.
export const ACCENT = "#2f5bd3";
export const card =
  "rounded-2xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_rgb(0_0_0/0.04)]";
const number = (value: number) => value.toLocaleString("en-GB");
const percent = (value: number) =>
  `${value.toLocaleString("en-GB", { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
const share = (part: number, whole: number) => (whole ? percent((part / whole) * 100) : "—");

// ------------------------------------------------------------------ live now
export function LiveNow({ siteId }: { siteId?: string }) {
  const [live, setLive] = useState<{ visitors: number; pages: { id: string; title: string; value: number }[] } | null>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch(withSite("/api/builder/analytics?view=live"), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => active && data && setLive(data))
        .catch(() => {});
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [siteId]);
  return (
    <section className={cn(card, "flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5")}>
      <div className="flex shrink-0 items-center gap-3 sm:w-56">
        <span className="relative flex size-2.5" aria-hidden>
          {!!live?.visitors && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={cn("relative inline-flex size-2.5 rounded-full", live?.visitors ? "bg-emerald-500" : "bg-neutral-300")} />
        </span>
        <div>
          <p className="text-2xl font-semibold tracking-[-0.03em]">{live ? number(live.visitors) : "…"}</p>
          <p className="text-xs text-neutral-500">Live now · last 5 minutes</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {!live || live.pages.length === 0 ? (
          <p className="text-sm text-neutral-400">Nobody on the website right now. Updates every 15 seconds.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {live.pages.map((page) => (
              <li key={page.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-neutral-50 px-3 py-1.5 text-sm">
                <span className="truncate">{page.title}</span>
                <span className="tabular-nums text-neutral-500">{page.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ funnels
function Funnel({ title, note, steps }: { title: string; note: string; steps: { label: string; value: number }[] }) {
  const first = steps[0]?.value || 0;
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className={cn(card, "min-w-0 p-4 sm:p-6")}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 mb-4 text-xs text-neutral-400">{note}</p>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, i) => (
          <li key={step.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{step.label}</span>
              <span className="shrink-0 tabular-nums">
                {number(step.value)}
                <span className="ml-2 text-xs text-neutral-400">
                  {i === 0 ? "100%" : share(step.value, first)}
                </span>
              </span>
            </div>
            <div className="h-7 overflow-hidden rounded-md bg-neutral-100">
              <div className="h-full rounded-md" style={{ width: `${(step.value / max) * 100}%`, background: ACCENT, opacity: 0.18 + 0.6 * (1 - i / Math.max(1, steps.length)) }} />
            </div>
            {i > 0 && (
              <p className="mt-1 text-[11px] text-neutral-400">
                {share(step.value, steps[i - 1].value)} of the previous step
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
export function Funnels({ report }: { report: AnalyticsReport }) {
  const s = report.funnel.current;
  const shop = report.shop || !!(s.product || s.cart || s.checkout);
  return (
    <section className={cn("grid gap-5", shop && "lg:grid-cols-2")}>
      {shop && (
        <Funnel
          title="Shop funnel"
          note="Unique visitors per day who reached each step, summed"
          steps={[
            { label: "Viewed products or the catalogue", value: s.product || 0 },
            { label: "Added to cart", value: s.cart || 0 },
            { label: "Opened the checkout", value: s.checkout || 0 },
            { label: "Placed the order", value: s.order || 0 },
          ]}
        />
      )}
      <Funnel
        title="Enquiry funnel"
        note="Visitors → started filling a form (first click into a field) → sent it"
        steps={[
          { label: "Visitors", value: report.totals.visitors },
          { label: "Started a form", value: s.form_start || 0 },
          { label: "Sent the form", value: s.form_sent || 0 },
        ]}
      />
      {(s.booking || 0) > 0 && (
        <Funnel
          title="Online booking"
          note="Visitors → booked a time with the booking widget"
          steps={[
            { label: "Visitors", value: report.totals.visitors },
            { label: "Booked online", value: s.booking || 0 },
          ]}
        />
      )}
    </section>
  );
}

// ------------------------------------------------------------------ goals
const goalTypeLabels = { page: "Visited a page", action: "Contact action", form: "Sent a form", order: "Placed an order", booking: "Booked online" } as const;
const actionNames: Record<string, string> = { any: "Any contact action", phone: "Phone click", email: "Email click", whatsapp: "WhatsApp", telegram: "Telegram", calculator: "Calculator opened" };
export function Goals({ report, onChange }: { report: AnalyticsReport; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<keyof typeof goalTypeLabels>("page");
  const [page, setPage] = useState("");
  const [action, setAction] = useState("any");
  const [error, setError] = useState("");
  const pages = report.pageList;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch(withSite("/api/builder/analytics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || goalTypeLabels[type],
        type,
        ...(type === "action" ? { action } : page ? { page } : {}),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || "Could not save the goal.");
    setAdding(false);
    setName("");
    setPage("");
    onChange();
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this goal? Its numbers are calculated from the statistics and come back if you add it again.")) return;
    await fetch(withSite(`/api/builder/analytics?goal=${encodeURIComponent(id)}`), { method: "DELETE" });
    onChange();
  }
  const describe = (g: AnalyticsReport["goals"][number]) =>
    g.type === "page"
      ? `Visitors of ${g.pageTitle}`
      : g.type === "action"
        ? actionNames[g.action || "any"]
        : g.type === "form"
          ? `Enquiries${g.page ? ` from ${g.pageTitle}` : ", whole website"}`
          : g.type === "booking"
            ? `Online bookings${g.page ? ` from ${g.pageTitle}` : ", whole website"}`
          : `Orders${g.page ? ` with products of ${g.pageTitle}` : ", whole website"}`;
  return (
    <section className={cn(card, "min-w-0 p-4 sm:p-6")}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Goals</h2>
          <p className="mt-0.5 text-xs text-neutral-400">Conversion = completions ÷ visitors. Goals are counted from the stored statistics, so a new goal shows past periods too.</p>
        </div>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="bg-white">
            <Plus data-icon="inline-start" /> Add goal
          </Button>
        )}
      </div>
      {adding && (
        <form onSubmit={save} className="mb-4 grid gap-3 rounded-xl bg-neutral-50 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_1fr_auto]">
          <Input aria-label="Goal name" placeholder="Goal name, e.g. Price page" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-9 bg-white" />
          <Select aria-label="Goal type" className="h-9 bg-white" value={type} onValueChange={(v) => setType(v as keyof typeof goalTypeLabels)}>
            {Object.entries(goalTypeLabels).map(([key, label]) => (
              <SelectOption key={key} value={key}>{label}</SelectOption>
            ))}
          </Select>
          {type === "action" ? (
            <Select aria-label="Contact action" className="h-9 bg-white" value={action} onValueChange={setAction}>
              {Object.entries(actionNames).map(([key, label]) => (
                <SelectOption key={key} value={key}>{label}</SelectOption>
              ))}
            </Select>
          ) : (
            <Select aria-label="Page" className="h-9 bg-white" value={page} placeholder={type === "page" ? "Choose a page" : "Whole website"} onValueChange={setPage}>
              {[...(type === "page" ? [] : [{ id: "", title: "Whole website" }]), ...pages].map((p) => (
                <SelectOption key={p.id || "all"} value={p.id}>{p.title}</SelectOption>
              ))}
            </Select>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-9">Save</Button>
            <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
          {error && <p className="text-sm text-red-700 sm:col-span-2 lg:col-span-4">{error}</p>}
        </form>
      )}
      {report.goals.length === 0 ? (
        !adding && <p className="text-sm text-neutral-400">No goals yet. Add one: a page that matters (prices, contacts), a phone click, a sent form or an order.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {report.goals.map((goal) => {
            const diff = goal.conversion - goal.prevConversion;
            return (
              <li key={goal.id} className="group relative min-w-0 rounded-xl bg-neutral-50 p-4">
                <p className="truncate pr-8 text-sm font-medium">{goal.name}</p>
                <p className="truncate text-xs text-neutral-400">{describe(goal)}</p>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="text-2xl font-semibold tracking-[-0.03em]">{percent(goal.conversion)}</span>
                  <span className="text-sm tabular-nums text-neutral-600">{number(goal.value)} completions</span>
                </div>
                <p className="mt-1 text-xs">
                  {goal.value || goal.prev ? (
                    <span className={cn("font-medium", diff >= 0 ? "text-emerald-700" : "text-neutral-600")}>
                      {diff >= 0 ? "↑ +" : "↓ −"}
                      {Math.abs(diff).toFixed(1)} pp
                    </span>
                  ) : (
                    <span className="text-neutral-400">No data</span>
                  )}
                  <span className="text-neutral-400"> vs previous · was {number(goal.prev)}</span>
                </p>
                <button type="button" aria-label={`Delete goal ${goal.name}`} onClick={() => remove(goal.id)} className="absolute top-3 right-3 rounded-md p-1.5 text-neutral-400 hover:bg-white hover:text-red-600">
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ click map + scroll depth
type ClickData = {
  views: number;
  total: number;
  scroll: number[];
  elements: { key: string; section: string; path: string; label: string; value: number }[];
};
export function PageInsights({ report, days }: { report: AnalyticsReport; days: number }) {
  const choices = report.pageList.filter((p) => p.href);
  const top = report.pages.find((p) => choices.some((c) => c.id === p.id))?.id;
  const [picked, setPageId] = useState("");
  // A new website or a removed page: start with the most viewed page.
  const pageId = choices.some((c) => c.id === picked) ? picked : top || choices[0]?.id || "";
  const [data, setData] = useState<ClickData | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!pageId) return;
    let active = true;
    fetch(withSite(`/api/builder/analytics?view=clicks&days=${days}&page=${encodeURIComponent(pageId)}`), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setData(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pageId, days, report]);
  const page = choices.find((p) => p.id === pageId);
  const max = Math.max(1, ...(data?.elements.map((e) => e.value) || [0]));
  if (!choices.length) return null;
  return (
    <section className={cn(card, "min-w-0 p-4 sm:p-6")}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Clicks and scroll depth</h2>
          <p className="mt-0.5 text-xs text-neutral-400">Clicks on links and buttons of a page; typed text and form fields are never recorded.</p>
        </div>
        <Select aria-label="Page" className="h-9 w-56 bg-white" value={pageId} onValueChange={setPageId}>
          {choices.map((p) => (
            <SelectOption key={p.id} value={p.id}>{p.title}</SelectOption>
          ))}
        </Select>
      </div>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h3 className="mb-2 text-xs font-medium text-neutral-500">Scroll depth · {number(data?.views || 0)} views</h3>
            <ul className="flex flex-col gap-1.5">
              {[25, 50, 75, 100].map((mark, i) => {
                const value = data?.scroll[i] || 0;
                const pct = data?.views ? Math.min(100, (value / data.views) * 100) : 0;
                return (
                  <li key={mark} className="relative flex min-h-8 items-center justify-between gap-3 overflow-hidden rounded-md px-2.5 text-sm">
                    <span aria-hidden className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${pct}%`, background: ACCENT, opacity: 0.12 }} />
                    <span className="relative">Reached {mark}%</span>
                    <span className="relative tabular-nums text-neutral-600">{data?.views ? percent(pct) : "—"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-medium text-neutral-500">Most clicked · {number(data?.total || 0)} clicks</h3>
            {!data || data.elements.length === 0 ? (
              <p className="text-sm text-neutral-400">No clicks on this page in the period.</p>
            ) : (
              <ol className="flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
                {data.elements.slice(0, 40).map((el, i) => (
                  <li
                    key={el.key}
                    onMouseEnter={() => setHover(el.key)}
                    onMouseLeave={() => setHover(null)}
                    className={cn("relative flex min-h-8 items-center gap-2 overflow-hidden rounded-md px-2.5 text-sm", hover === el.key && "bg-neutral-100")}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${(el.value / max) * 100}%`, background: ACCENT, opacity: 0.1 }} />
                    <span className="relative w-5 shrink-0 text-xs tabular-nums text-neutral-400">{i + 1}</span>
                    <span className="relative min-w-0 flex-1 truncate" title={el.label}>
                      {el.label || "(no text)"}
                      {missing.has(el.key) && <span className="ml-1.5 text-xs text-neutral-400">not on the page now</span>}
                    </span>
                    <span className="relative shrink-0 tabular-nums text-neutral-600">{number(el.value)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        {page && <ClickOverlay href={page.href} elements={data?.elements || []} hover={hover} onMissing={setMissing} />}
      </div>
    </section>
  );
}

// The published page in a same-origin iframe (the analytics beacon is silent inside iframes)
// with a dot per clicked element, placed by the element's position on the page.
function ClickOverlay({
  href,
  elements,
  hover,
  onMissing,
}: {
  href: string;
  elements: ClickData["elements"];
  hover: string | null;
  onMissing: (keys: Set<string>) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0);
  const [loaded, setLoaded] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const viewport = width >= 640 ? 1280 : 390;
  const scale = width ? width / viewport : 1;
  const height = width >= 640 ? 620 : 560;
  const place = useCallback(() => {
    const doc = frame.current?.contentDocument;
    const win = frame.current?.contentWindow;
    if (!doc?.body || !win) return;
    doc.getElementById("cms-click-dots")?.remove();
    const layer = doc.createElement("div");
    layer.id = "cms-click-dots";
    layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none";
    const max = Math.max(1, ...elements.map((e) => e.value));
    const missing = new Set<string>();
    elements.slice(0, 60).forEach((el, i) => {
      let target: Element | null = null;
      try {
        const root = el.section ? doc.querySelector(`[data-section-id="${CSS.escape(el.section)}"]`) : doc.body;
        target = root && el.path ? root.querySelector(`:scope>${el.path}`) : null;
      } catch {}
      const rect = target?.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return missing.add(el.key);
      const size = (18 + 22 * Math.sqrt(el.value / max)) / scale;
      const dot = doc.createElement("div");
      dot.dataset.key = el.key;
      dot.textContent = String(i + 1);
      dot.style.cssText = `position:absolute;left:${rect.left + win.scrollX + rect.width / 2 - size / 2}px;top:${rect.top + win.scrollY + rect.height / 2 - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:rgba(47,91,211,.78);color:#fff;font:600 ${Math.round(11 / scale)}px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 ${3 / scale}px rgba(255,255,255,.85),0 4px 14px rgba(0,0,0,.25)`;
      layer.append(dot);
    });
    doc.body.append(layer);
    onMissing(missing);
  }, [elements, scale, onMissing]);
  useEffect(() => {
    if (!loaded) return;
    place();
    // Widgets (carousels, cart links) settle after load.
    const timer = setTimeout(place, 1200);
    return () => clearTimeout(timer);
  }, [loaded, place]);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    doc?.querySelectorAll<HTMLElement>("#cms-click-dots > div").forEach((dot) => {
      dot.style.outline = dot.dataset.key === hover ? `${4 / scale}px solid #111` : "";
      dot.style.zIndex = dot.dataset.key === hover ? "2" : "";
    });
  }, [hover, scale, loaded]);
  function onLoad() {
    const doc = frame.current?.contentDocument;
    // Preview only: links and buttons inside do nothing.
    doc?.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
    doc?.addEventListener("submit", (e) => e.preventDefault(), true);
    setLoaded((n) => n + 1);
  }
  return (
    <div ref={wrap} className="relative min-w-0 overflow-hidden rounded-xl bg-neutral-100" style={{ height }}>
      {width > 0 && (
        <iframe
          ref={frame}
          key={href}
          src={href}
          title="Page preview with clicks"
          onLoad={onLoad}
          className="absolute top-0 left-0 origin-top-left border-0 bg-white"
          style={{ width: viewport, height: height / scale, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ weekly report
export function WeeklyReportCard({ isOwner, weekly, onChange }: { isOwner: boolean; weekly: AnalyticsReport["weekly"]; onChange: () => void }) {
  const [data, setData] = useState<{ report: WeeklyReport; channels: { email: boolean; telegram: boolean } } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(withSite("/api/builder/analytics?view=weekly"), { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (active) setData(d);
      })
      .catch((e) => active && setError(e.message || "Could not build the report."));
    return () => {
      active = false;
    };
  }, [weekly]);
  async function toggle(key: "email" | "telegram", value: boolean) {
    const response = await fetch(withSite("/api/builder/analytics"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: weekly.email, telegram: weekly.telegram, [key]: value }),
    });
    if (!response.ok) setError((await response.json().catch(() => ({}))).error || "Could not save.");
    onChange();
  }
  const r = data?.report;
  return (
    <section className={cn(card, "min-w-0 p-4 sm:p-6")}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Weekly report</h2>
          <p className="mt-0.5 text-xs text-neutral-400">Sent on Mondays for the last 7 days, compared with the week before. Preview of this week:</p>
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 rounded-xl bg-neutral-50 p-4 text-sm">
          {!r ? (
            <p className="text-neutral-400">Building the preview…</p>
          ) : (
            <>
              <p className="font-medium">{r.subject}</p>
              <dl className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5">
                {r.rows.map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="text-neutral-600">{row.label}</dt>
                    <dd className="text-right font-medium tabular-nums">{row.value}</dd>
                    <dd className="text-right text-xs tabular-nums text-neutral-500">{row.change}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 mb-1.5 text-xs font-medium text-neutral-500">Top pages</p>
              {r.topPages.length ? (
                <ol className="flex flex-col gap-1">
                  {r.topPages.map((p, i) => (
                    <li key={p.title + i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{i + 1}. {p.title}</span>
                      <span className="shrink-0 tabular-nums text-neutral-500">{number(p.views)} views</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-neutral-400">No page views this week.</p>
              )}
              {r.goals.length > 0 && (
                <>
                  <p className="mt-4 mb-1.5 text-xs font-medium text-neutral-500">Goals</p>
                  <ul className="flex flex-col gap-1">
                    {r.goals.map((g) => (
                      <li key={g.name} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">{g.name}</span>
                        <span className="shrink-0 tabular-nums text-neutral-500">{number(g.value)} · {g.change}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col gap-3 text-sm">
          {(
            [
              ["email", "By e-mail", "To the form recipient, through the website's SMTP."],
              ["telegram", "By Telegram", "Through the website's Telegram bot (CRM → Telegram notifications)."],
            ] as const
          ).map(([key, label, note]) => {
            const ready = data?.channels[key];
            return (
              <label key={key} className="flex items-start justify-between gap-3 rounded-xl bg-neutral-50 p-3">
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-neutral-500">{note}</span>
                  {data && !ready && (
                    <span className="mt-1 block text-xs text-amber-700">
                      {key === "email" ? "SMTP or the form recipient is not set up: nothing will be sent." : "The Telegram bot is not connected: nothing will be sent."}
                    </span>
                  )}
                </span>
                <Switch checked={weekly[key]} disabled={!isOwner} onCheckedChange={(v) => toggle(key, v)} aria-label={label} />
              </label>
            );
          })}
          {weekly.lastSent && (
            <p className="text-xs text-neutral-500">Last sent {weekly.lastSent}{weekly.lastResult ? ` · ${weekly.lastResult}` : ""}</p>
          )}
          {!isOwner && <p className="text-xs text-neutral-400">Only the administrator can switch the delivery.</p>}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ CSV export
function csv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v);
    // Spreadsheet formula injection: prefix cells that start like a formula.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportPages(report: AnalyticsReport, siteKey: string) {
  const money = (r: Record<string, number>) => Object.entries(r).map(([c, v]) => `${Math.round(v * 100) / 100} ${c}`).join(" + ");
  download(
    `analytics-pages-${siteKey}-${report.from}-${report.to}.csv`,
    csv([
      ["Page", "Address", "Views", "Visitors", "Enquiries", "Enquiry conversion %", "Orders", "Revenue", "Contact actions", "Avg. time s", "Scroll 25 %", "Scroll 50 %", "Scroll 75 %", "Scroll 100 %"],
      ...report.pages.map((p) => [
        p.title,
        p.slug ? `/${p.slug}` : "",
        p.views,
        p.visitors,
        p.enquiries,
        p.visitors ? Math.round((p.enquiries / p.visitors) * 1000) / 10 : 0,
        p.orders,
        money(p.revenue),
        p.actions,
        p.timed ? Math.round(p.time / p.timed / 1000) : 0,
        ...p.scroll.map((n) => (p.views ? Math.round((Math.min(n, p.views) / p.views) * 1000) / 10 : 0)),
      ]),
    ]),
  );
}
export function exportSeries(report: AnalyticsReport, siteKey: string) {
  download(
    `analytics-daily-${siteKey}-${report.from}-${report.to}.csv`,
    csv([
      ["Date", "Visitors", "Page views", "Enquiries", "Orders", "Contact actions"],
      ...report.series.map((d) => [d.date, d.visitors, d.views, d.enquiries, d.orders, d.actions]),
    ]),
  );
}
export function ExportButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="text-neutral-500">
      <Download data-icon="inline-start" /> {label}
    </Button>
  );
}
