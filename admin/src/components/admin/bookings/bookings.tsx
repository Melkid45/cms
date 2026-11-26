"use client";
import { Select, SelectOption } from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { withSite } from "@/lib/builder/site-client";
import { useAccess } from "@/components/admin/access-context";
import { AdminPanel, chip } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { card, field, label, Dialog, ErrorLine } from "@/components/admin/crm/crm-ui";
import { BookingSettingsForm } from "./booking-settings";
import {
  addDays,
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  freeSlots,
  hhmm,
  holdsTime,
  parseHhmm,
  weekdayOf,
  type Booking,
  type BookingSettings,
  type BookingStatus,
} from "@/lib/builder/booking/shared";
import { cn } from "@/lib/utils";

// Dashboard → Bookings: calendar (day / week) of the website's bookings, list, settings.
// Every change goes to /api/builder/bookings; the server re-checks free time and revisions.
type Data = { settings: BookingSettings; settingsRevision: number; items: Booking[]; timeZone: string; today: string; nowMinutes: number };
async function request<T>(body?: object): Promise<T> {
  const r = await fetch(withSite("/api/builder/bookings"), {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Could not complete this operation.");
  return data as T;
}
const tone: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-950",
  confirmed: "bg-emerald-100 text-emerald-950",
  cancelled: "bg-neutral-100 text-neutral-400 line-through",
  "no-show": "bg-red-100 text-red-900",
  done: "bg-sky-100 text-sky-950",
};
const pill: Record<BookingStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  confirmed: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-neutral-100 text-neutral-500",
  "no-show": "bg-red-50 text-red-700",
  done: "bg-sky-50 text-sky-800",
};
const fmt = (date: string, o: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
const PX = 1.1; // pixels per minute in the calendar

export function Bookings() {
  const { isOwner } = useAccess();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"calendar" | "list" | "settings">("calendar");
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [open, setOpen] = useState<Booking | null>(null);
  const [draft, setDraft] = useState<{ date: string; from: number; staffId: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const d = await request<Data>();
      setData(d);
      setDate((x) => x || d.today);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load bookings.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, [load]);
  async function act(body: object) {
    try {
      const result = await request<Booking>(body);
      await load();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      await load();
      return null;
    }
  }
  // Toolbar actions of the one container (same pattern as every admin screen).
  const actions = (
    <div className="ml-auto flex flex-wrap gap-2.5">
      <Button variant="outline" className="h-10 px-4" onClick={() => void load()}>
        <RefreshCw /> Refresh
      </Button>
      {data && tab === "calendar" && (
        <Button className="h-10 px-4" onClick={() => setDraft({ date: date || data.today, from: 600, staffId: staffFilter })}>
          <Plus /> New booking
        </Button>
      )}
    </div>
  );
  if (!data)
    return (
      <AdminPanel title="Bookings" toolbar={actions}>
        <ErrorLine error={error} />
        {!error && <p className="text-sm text-neutral-500">Loading bookings…</p>}
      </AdminPanel>
    );
  const s = data.settings;
  const staff = s.staff.filter((p) => p.active || data.items.some((b) => b.staffId === p.id));
  return (
    <AdminPanel
      title="Bookings"
      toolbar={
        <>
          <nav className="flex gap-2.5 overflow-x-auto" aria-label="Bookings">
        {(
          [
            ["calendar", "Calendar", CalendarDays],
            ["list", "List", List],
            ["settings", "Services & hours", Settings2],
          ] as const
        ).map(([key, text, Icon]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(chip(tab === key), "shrink-0 gap-2")}
          >
            <Icon className="size-4" /> {text}
          </button>
        ))}
          </nav>
          {actions}
        </>
      }
    >
      <ErrorLine error={error} />
      {!s.enabled && tab !== "settings" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Online booking is off for this website. Turn it on and add services in “Services & hours”, then put the “Appointments” block (contact-v60) on a page.
        </p>
      )}
      {tab === "settings" && (
        <BookingSettingsForm
          key={data.settingsRevision}
          initial={s}
          revision={data.settingsRevision}
          onSave={async (settings, revision) => {
            try {
              await request({ action: "settings", settings, revision });
              await load();
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : "Could not save.";
            }
          }}
        />
      )}
      {tab === "list" && <BookingList data={data} onOpen={setOpen} />}
      {tab === "calendar" && (
        <Calendar
          data={data}
          view={view}
          setView={setView}
          date={date}
          setDate={setDate}
          staffFilter={staffFilter}
          setStaffFilter={setStaffFilter}
          staff={staff}
          onOpen={setOpen}
          onNew={(d) => setDraft(d)}
        />
      )}
      {open && (
        <BookingDialog
          data={data}
          booking={data.items.find((b) => b.id === open.id) || open}
          isOwner={isOwner}
          onClose={() => setOpen(null)}
          act={act}
        />
      )}
      {draft && <NewBooking data={data} initial={draft} onClose={() => setDraft(null)} act={act} />}
    </AdminPanel>
  );
}

// ------------------------------------------------------------------ calendar
function Calendar({
  data,
  view,
  setView,
  date,
  setDate,
  staffFilter,
  setStaffFilter,
  staff,
  onOpen,
  onNew,
}: {
  data: Data;
  view: "day" | "week";
  setView: (v: "day" | "week") => void;
  date: string;
  setDate: (d: string) => void;
  staffFilter: string;
  setStaffFilter: (s: string) => void;
  staff: BookingSettings["staff"];
  onOpen: (b: Booking) => void;
  onNew: (d: { date: string; from: number; staffId: string }) => void;
}) {
  const s = data.settings;
  const weekStart = addDays(date, -weekdayOf(date));
  const dates = view === "day" ? [date] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // Columns: day view = one per staff member (or one), week view = one per day.
  const columns =
    view === "day"
      ? (staff.length ? staff.filter((p) => !staffFilter || p.id === staffFilter) : [{ id: "", name: "Bookings", hours: null }]).map((p) => ({
          key: p.id || "all",
          title: p.name,
          date,
          staffId: p.id,
          hours: (p.hours || s.hours)[weekdayOf(date)] || [],
        }))
      : dates.map((d) => {
          const person = staff.find((p) => p.id === staffFilter);
          return { key: d, title: fmt(d, { weekday: "short", day: "numeric", month: "short" }), date: d, staffId: staffFilter, hours: (person?.hours || s.hours)[weekdayOf(d)] || [] };
        });
  const shown = data.items.filter((b) => dates.includes(b.date) && (!staffFilter || b.staffId === staffFilter));
  const allHours = [...s.hours, ...s.staff.flatMap((p) => p.hours || [])].flat();
  let start = Math.min(480, ...allHours.map((h) => h.from), ...shown.map((b) => b.from));
  let end = Math.max(1200, ...allHours.map((h) => h.to), ...shown.map((b) => b.to + b.buffer));
  start = Math.floor(start / 60) * 60;
  end = Math.min(1440, Math.ceil(end / 60) * 60);
  const holiday = (d: string) => s.holidays.find((h) => h.date === d);
  const nowLine = dates.includes(data.today) ? data.nowMinutes : -1;
  return (
    <div className={cn(card, "p-3 sm:p-5")}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Button size="icon-sm" variant="outline" className="bg-white" aria-label="Previous" onClick={() => setDate(addDays(date, view === "day" ? -1 : -7))}>
            <ChevronLeft />
          </Button>
          <Button size="sm" variant="outline" className="bg-white" onClick={() => setDate(data.today)}>
            Today
          </Button>
          <Button size="icon-sm" variant="outline" className="bg-white" aria-label="Next" onClick={() => setDate(addDays(date, view === "day" ? 1 : 7))}>
            <ChevronRight />
          </Button>
        </div>
        <input aria-label="Date" type="date" className={cn(field, "w-40")} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <h2 className="mr-auto text-sm font-semibold">
          {view === "day" ? fmt(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : `${fmt(dates[0], { day: "numeric", month: "short" })} – ${fmt(dates[6], { day: "numeric", month: "short", year: "numeric" })}`}
        </h2>
        {staff.length > 0 && (
          <Select aria-label="Staff" className="h-9 w-44" value={String(staffFilter)} onValueChange={(selectedValue) => setStaffFilter(selectedValue)}>
            <SelectOption value="">All staff</SelectOption>
            {staff.map((p) => (
              <SelectOption key={p.id} value={String(p.id)}>
                {p.name}
              </SelectOption>
            ))}
          </Select>
        )}
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          {(["day", "week"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1 text-sm capitalize", view === v ? "bg-white shadow-sm" : "text-neutral-500")}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px]" style={{ gridTemplateColumns: `52px repeat(${columns.length}, minmax(120px, 1fr))` }}>
          <div />
          {columns.map((c) => (
            <div key={c.key} className={cn("truncate px-2 pb-2 text-center text-xs font-medium", c.date === data.today && view === "week" && "text-black", c.date !== data.today && "text-neutral-500")}>
              {c.title}
              {holiday(c.date) && <span className="block text-[11px] text-red-600">{holiday(c.date)!.note || "Closed"}</span>}
            </div>
          ))}
          <div className="relative" style={{ height: (end - start) * PX }}>
            {Array.from({ length: (end - start) / 60 }, (_, i) => (
              <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-neutral-400 tabular-nums" style={{ top: i * 60 * PX }}>
                {i ? hhmm(start + i * 60) : ""}
              </span>
            ))}
          </div>
          {columns.map((c) => {
            const list = shown.filter((b) => b.date === c.date && (view === "week" || !c.staffId || b.staffId === c.staffId)).sort((a, b) => a.from - b.from || a.to - b.to);
            // Overlapping bookings in one column sit side by side (lanes).
            const lanes: number[] = [];
            const laneOf = new Map<string, number>();
            for (const b of list) {
              let lane = lanes.findIndex((endAt) => endAt <= b.from);
              if (lane < 0) lane = lanes.push(0) - 1;
              lanes[lane] = b.to;
              laneOf.set(b.id, lane);
            }
            const width = 100 / Math.max(1, lanes.length);
            const closed = !!holiday(c.date);
            return (
              <div
                key={c.key}
                className="relative ml-1 rounded-lg bg-neutral-100"
                style={{ height: (end - start) * PX }}
                onClick={(e) => {
                  if ((e.target as Element).closest("button")) return;
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  const from = Math.max(start, Math.min(end - 15, start + Math.floor(y / PX / 15) * 15));
                  onNew({ date: c.date, from, staffId: c.staffId });
                }}
              >
                {!closed &&
                  c.hours.map((h, i) => (
                    <div key={i} aria-hidden="true" className="absolute inset-x-0 bg-white" style={{ top: Math.max(0, h.from - start) * PX, height: (Math.min(h.to, end) - Math.max(h.from, start)) * PX }} />
                  ))}
                {Array.from({ length: (end - start) / 60 }, (_, i) => (
                  <div key={i} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-black/[0.04]" style={{ top: i * 60 * PX }} />
                ))}
                {nowLine >= start && nowLine <= end && c.date === data.today && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: (nowLine - start) * PX }} />
                )}
                {list.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpen(b)}
                    className={cn("absolute z-[1] overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-[0_1px_2px_rgb(0_0_0/0.08)] hover:brightness-95", tone[b.status])}
                    style={{ top: (b.from - start) * PX + 1, height: Math.max(22, (b.to - b.from) * PX - 2), left: `calc(${laneOf.get(b.id)! * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
                    aria-label={`${hhmm(b.from)}–${hhmm(b.to)} ${b.customer.name}, ${b.service}, ${BOOKING_STATUS_LABELS[b.status]}`}
                  >
                    <b className="tabular-nums">{hhmm(b.from)}</b> {b.customer.name}
                    <span className="block truncate opacity-75">
                      {b.service}
                      {view === "week" && b.staff ? ` · ${b.staff}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-500">
        {BOOKING_STATUSES.map((st) => (
          <span key={st} className="flex items-center gap-1.5">
            <span className={cn("inline-block size-3 rounded", tone[st])} /> {BOOKING_STATUS_LABELS[st]}
          </span>
        ))}
        <span>· Click an empty time to add a booking.</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ list
function BookingList({ data, onOpen }: { data: Data; onOpen: (b: Booking) => void }) {
  const [filter, setFilter] = useState<BookingStatus | "upcoming" | "">("upcoming");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.items
      .filter((b) => (filter === "upcoming" ? b.date >= data.today && holdsTime(b.status) && b.status !== "done" : !filter || b.status === filter))
      .filter((b) => !needle || [b.customer.name, b.customer.phone, b.customer.email, b.service, b.staff, String(b.number)].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => (filter === "upcoming" ? 1 : -1) * (a.date.localeCompare(b.date) || a.from - b.from));
  }, [data, filter, q]);
  return (
    <div className={cn(card, "p-3 sm:p-5")}>
      <div className="mb-4 flex flex-wrap gap-2">
        <input aria-label="Search bookings" placeholder="Search name, phone, service…" className={cn(field, "w-64")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Status" className="h-9 w-44" value={String(filter)} onValueChange={(selectedValue) => setFilter(selectedValue as typeof filter)}>
          <SelectOption value="upcoming">Upcoming</SelectOption>
          <SelectOption value="">All</SelectOption>
          {BOOKING_STATUSES.map((s) => (
            <SelectOption key={s} value={String(s)}>
              {BOOKING_STATUS_LABELS[s]}
            </SelectOption>
          ))}
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-2 pr-3 font-normal">#</th>
              <th className="py-2 pr-3 font-normal">When</th>
              <th className="py-2 pr-3 font-normal">Customer</th>
              <th className="py-2 pr-3 font-normal">Service</th>
              <th className="py-2 pr-3 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((b) => (
              <tr key={b.id} className="cursor-pointer align-top hover:bg-neutral-50" onClick={() => onOpen(b)}>
                <td className="py-2 pr-3 text-neutral-500">{b.number}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  <button type="button" className="text-left" onClick={() => onOpen(b)}>
                    {fmt(b.date, { weekday: "short", day: "numeric", month: "short" })}, {hhmm(b.from)}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  {b.customer.name}
                  <span className="block text-xs text-neutral-500">{[b.customer.phone, b.customer.email].filter(Boolean).join(" · ")}</span>
                </td>
                <td className="py-2 pr-3">
                  {b.service}
                  {b.staff && <span className="block text-xs text-neutral-500">{b.staff}</span>}
                </td>
                <td className="py-2 pr-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", pill[b.status])}>{BOOKING_STATUS_LABELS[b.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="py-10 text-center text-sm text-neutral-500">No bookings here.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dialogs
function TimeFields({
  data,
  value,
  onChange,
  ignoreId,
}: {
  data: Data;
  value: { serviceId: string; staffId: string; date: string; from: number };
  onChange: (v: { serviceId: string; staffId: string; date: string; from: number }) => void;
  ignoreId?: string;
}) {
  const s = data.settings;
  const free = freeSlots(s, data.items, { ...value, today: data.today, nowMinutes: data.nowMinutes, ignoreId, ignoreNotice: true }).map((x) => x.from);
  const isFree = free.includes(value.from);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={label} htmlFor="bk-svc">Service</label>
        <Select id="bk-svc" className="h-9 " value={String(value.serviceId)} onValueChange={(selectedValue) => onChange({ ...value, serviceId: selectedValue })}>
          {s.services.map((x) => (
            <SelectOption key={x.id} value={String(x.id)}>
              {x.name} · {x.duration} min{x.active ? "" : " (off)"}
            </SelectOption>
          ))}
        </Select>
      </div>
      {s.staff.length > 0 && (
        <div>
          <label className={label} htmlFor="bk-staff">Staff</label>
          <Select id="bk-staff" className="h-9 " value={String(value.staffId)} onValueChange={(selectedValue) => onChange({ ...value, staffId: selectedValue })}>
            <SelectOption value="">First free</SelectOption>
            {s.staff.map((p) => (
              <SelectOption key={p.id} value={String(p.id)}>
                {p.name}
              </SelectOption>
            ))}
          </Select>
        </div>
      )}
      <div>
        <label className={label} htmlFor="bk-date">Date</label>
        <input id="bk-date" type="date" className={field} value={value.date} onChange={(e) => e.target.value && onChange({ ...value, date: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor="bk-time">Time</label>
        <input id="bk-time" type="time" step={300} className={field} value={hhmm(value.from)} onChange={(e) => { const n = parseHhmm(e.target.value); if (!Number.isNaN(n)) onChange({ ...value, from: n }); }} />
      </div>
      <div className="sm:col-span-2">
        <p className={label}>Free times that day</p>
        <div className="flex flex-wrap gap-1">
          {free.slice(0, 48).map((t) => (
            <button key={t} type="button" onClick={() => onChange({ ...value, from: t })} className={cn("rounded-md px-2 py-1 text-xs tabular-nums", t === value.from ? "bg-black text-white" : "bg-neutral-100 hover:bg-neutral-200")}>
              {hhmm(t)}
            </button>
          ))}
          {!free.length && <span className="text-xs text-neutral-500">None (closed, holiday or fully booked).</span>}
        </div>
        {!isFree && <p className="mt-2 text-xs text-amber-700">This time is outside the hours or overlaps another booking.</p>}
      </div>
    </div>
  );
}

function NewBooking({ data, initial, onClose, act }: { data: Data; initial: { date: string; from: number; staffId: string }; onClose: () => void; act: (b: object) => Promise<Booking | null> }) {
  const [time, setTime] = useState({ serviceId: data.settings.services[0]?.id || "", staffId: initial.staffId, date: initial.date, from: initial.from });
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [comment, setComment] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data.settings.services.length)
    return (
      <Dialog title="New booking" onClose={onClose}>
        <p className="text-sm">Add services first (tab “Services & hours”).</p>
      </Dialog>
    );
  return (
    <Dialog title="New booking" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await act({ action: "create", ...time, customer, comment, force, status: "confirmed" });
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <TimeFields data={data} value={time} onChange={setTime} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="nb-name">Customer name</label>
            <input id="nb-name" required maxLength={160} className={field} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="nb-phone">Phone</label>
            <input id="nb-phone" type="tel" maxLength={40} className={field} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="nb-email">E-mail</label>
            <input id="nb-email" type="email" maxLength={254} className={field} value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="nb-comment">Comment</label>
          <textarea id="nb-comment" rows={2} maxLength={2000} className={cn(field, "h-auto py-2")} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Book even outside the hours or over another booking
        </label>
        <Button type="submit" disabled={busy || !customer.name.trim()}>
          Add booking
        </Button>
      </form>
    </Dialog>
  );
}

function BookingDialog({ data, booking: b, isOwner, onClose, act }: { data: Data; booking: Booking; isOwner: boolean; onClose: () => void; act: (b: object) => Promise<Booking | null> }) {
  const [time, setTime] = useState({ serviceId: b.serviceId, staffId: b.staffId, date: b.date, from: b.from });
  const [note, setNote] = useState(b.note);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const moved = time.serviceId !== b.serviceId || time.staffId !== b.staffId || time.date !== b.date || time.from !== b.from;
  const run = async (body: object) => {
    setBusy(true);
    await act({ action: "update", id: b.id, revision: b.revision, ...body });
    setBusy(false);
  };
  return (
    <Dialog title={`Booking #${b.number}`} onClose={onClose} wide>
      <div className="space-y-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className={label}>Customer</dt>
            <dd>{b.customer.name}</dd>
          </div>
          <div>
            <dt className={label}>Contacts</dt>
            <dd>
              {b.customer.phone && <a href={`tel:${b.customer.phone.replace(/[^+\d]/g, "")}`}>{b.customer.phone}</a>}
              {b.customer.email && (
                <a className="block" href={`mailto:${b.customer.email}`}>
                  {b.customer.email}
                </a>
              )}
            </dd>
          </div>
          <div>
            <dt className={label}>When</dt>
            <dd>
              {fmt(b.date, { weekday: "short", day: "numeric", month: "short" })}, {hhmm(b.from)}–{hhmm(b.to)}
              <span className="block text-xs text-neutral-500">
                {b.service}
                {b.staff && ` · ${b.staff}`}
                {b.price ? ` · ${b.price} ${b.currency}` : ""}
              </span>
            </dd>
          </div>
          {b.comment && (
            <div className="sm:col-span-3">
              <dt className={label}>Comment</dt>
              <dd className="whitespace-pre-wrap">{b.comment}</dd>
            </div>
          )}
        </dl>
        <div>
          <p className={label}>Status</p>
          <div className="flex flex-wrap gap-1">
            {BOOKING_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                disabled={busy || st === b.status}
                aria-pressed={st === b.status}
                onClick={() => void run({ status: st })}
                className={cn("rounded-full px-3 py-1 text-sm", st === b.status ? pill[st] + " font-semibold" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200")}
              >
                {BOOKING_STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        </div>
        <details className="rounded-xl bg-neutral-50 p-3">
          <summary className="cursor-pointer text-sm font-medium">Move to another time</summary>
          <div className="mt-3 space-y-3">
            <TimeFields data={data} value={time} onChange={setTime} ignoreId={b.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Allow outside the hours or over another booking
            </label>
            <Button size="sm" disabled={busy || !moved} onClick={() => void run({ move: { ...time, force } })}>
              Move booking
            </Button>
          </div>
        </details>
        <div>
          <label className={label} htmlFor="bk-note">Internal note</label>
          <textarea id="bk-note" rows={2} maxLength={4000} className={cn(field, "h-auto py-2")} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="outline" className="mt-2 bg-white" disabled={busy || note === b.note} onClick={() => void run({ note })}>
            Save note
          </Button>
        </div>
        <p className="text-xs text-neutral-500">
          {b.source === "website" ? "Booked on the website" : "Added by the team"} · Confirmation e-mail: {b.email === "sent" ? "sent" : b.email === "failed" ? "failed" : "not sent"} · History:{" "}
          {b.history.map((h) => `${h.text || BOOKING_STATUS_LABELS[h.status]} (${h.by}, ${new Date(h.at).toLocaleDateString("en-GB", { timeZone: data.timeZone })})`).join(" → ")}
        </p>
        {isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-700"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`Delete booking #${b.number} permanently? (Cancelling keeps it in the history.)`)) return;
              setBusy(true);
              const ok = await act({ action: "delete", ids: [b.id] });
              setBusy(false);
              if (ok) onClose();
            }}
          >
            <Trash2 /> Delete permanently
          </Button>
        )}
      </div>
    </Dialog>
  );
}
