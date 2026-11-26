// Online booking (appointments for service businesses): types and the slot engine, shared
// by the server and the dashboard (no server-only imports). Times of a booking are kept in
// the website's time zone: `date` (yyyy-mm-dd) + minutes from midnight; `start`/`end` are the
// same moments in UTC (calendar files, notice checks).

export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled", "no-show", "done"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  "no-show": "No-show",
  done: "Done",
};
// Statuses that keep their time taken (cancelled frees it).
export const holdsTime = (status: BookingStatus) => status !== "cancelled";

export interface Interval {
  from: number; // minutes from midnight
  to: number;
}
// Seven days, Monday first. An empty day = closed / day off.
export type WeekHours = Interval[][];
export interface BookingService {
  id: string;
  name: string;
  duration: number; // minutes
  price: number;
  buffer: number; // minutes kept free after the appointment
  staffIds: string[]; // empty = every staff member
  active: boolean;
}
export interface BookingStaff {
  id: string;
  name: string;
  role: string;
  hours: WeekHours | null; // null = business hours
  vacations: { from: string; to: string; note: string }[];
  active: boolean;
}
export interface BookingSettings {
  enabled: boolean;
  services: BookingService[];
  staff: BookingStaff[];
  hours: WeekHours;
  holidays: { date: string; note: string }[];
  step: number; // minutes between slot starts
  minNotice: number; // minutes
  maxDays: number; // how far ahead a visitor can book
  autoConfirm: boolean;
  capacity: number; // parallel bookings when there is no staff list
  currency: string;
}
export interface Booking {
  id: string;
  number: number;
  createdAt: string;
  updatedAt: string;
  revision: number;
  status: BookingStatus;
  serviceId: string;
  service: string;
  staffId: string;
  staff: string;
  date: string;
  from: number;
  to: number;
  buffer: number;
  start: string; // ISO UTC
  end: string;
  price: number;
  currency: string;
  customer: { name: string; phone: string; email: string };
  comment: string;
  locale: string;
  pageId: string;
  source: "website" | "admin";
  note: string;
  email: "none" | "sent" | "failed";
  history: { at: string; status: BookingStatus; by: string; text?: string }[];
  test?: boolean;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const day = (from: number, to: number): Interval[] => [{ from, to }];
export const defaultHours = (): WeekHours => [
  day(540, 1080),
  day(540, 1080),
  day(540, 1080),
  day(540, 1080),
  day(540, 1080),
  day(600, 900),
  [],
];
export const defaultBookingSettings = (): BookingSettings => ({
  enabled: false,
  services: [],
  staff: [],
  hours: defaultHours(),
  holidays: [],
  step: 30,
  minNotice: 120,
  maxDays: 60,
  autoConfirm: false,
  capacity: 1,
  currency: "EUR",
});

// ------------------------------------------------------------------ time helpers
export const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
export const parseHhmm = (value: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return NaN;
  const h = Number(m[1]),
    min = Number(m[2]);
  return h <= 24 && min < 60 && h * 60 + min <= 1440 ? h * 60 + min : NaN;
};
// Days since 1970-01-01 of a yyyy-mm-dd date (no time zone involved).
export const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};
export const dateOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => dateOf(dayNumber(date) + n);
// 0 = Monday … 6 = Sunday.
export const weekdayOf = (date: string) => (new Date(dayNumber(date) * 86400000).getUTCDay() + 6) % 7;
export const validZone = (zone: string | undefined) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone || "UTC" });
    return zone || "UTC";
  } catch {
    return "UTC";
  }
};
// Wall clock of a moment in a time zone.
export function zonedParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validZone(timeZone),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const hour = get("hour") % 24;
  return {
    date: `${get("year")}-${pad(get("month"))}-${pad(get("day"))}`,
    minutes: hour * 60 + get("minute"),
    utcGuess: Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second")),
  };
}
// The UTC moment of a wall-clock time (date + minutes) in a time zone (handles DST).
export function zonedToUtc(date: string, minutes: number, timeZone: string) {
  const guess = dayNumber(date) * 86400000 + minutes * 60000;
  const offset = (t: number) => Math.round((zonedParts(new Date(t), timeZone).utcGuess - t) / 60000);
  let t = guess - offset(guess) * 60000;
  const second = offset(t);
  t = guess - second * 60000;
  return new Date(t);
}
export const nowIn = (timeZone: string, at = new Date()) => zonedParts(at, timeZone);

// ------------------------------------------------------------------ slot engine
interface Resource {
  id: string; // staff id, or "" when the business has no staff list
  hours: Interval[];
}
export function servicesStaff(settings: BookingSettings, service: BookingService) {
  const active = settings.staff.filter((s) => s.active);
  return service.staffIds.length ? active.filter((s) => service.staffIds.includes(s.id)) : active;
}
const onVacation = (staff: BookingStaff, date: string) =>
  staff.vacations.some((v) => v.from <= date && date <= (v.to || v.from));
export const isHoliday = (settings: BookingSettings, date: string) =>
  settings.holidays.some((h) => h.date === date);
// Who could do this service on that day, with their working hours.
function resources(settings: BookingSettings, service: BookingService, staffId: string, date: string): Resource[] {
  if (isHoliday(settings, date)) return [];
  const weekday = weekdayOf(date);
  if (!settings.staff.some((s) => s.active)) return [{ id: "", hours: settings.hours[weekday] || [] }];
  return servicesStaff(settings, service)
    .filter((s) => (!staffId || s.id === staffId) && !onVacation(s, date))
    .map((s) => ({ id: s.id, hours: (s.hours || settings.hours)[weekday] || [] }));
}
export interface SlotQuery {
  serviceId: string;
  staffId: string; // "" = anyone
  date: string;
  today: string; // in the website time zone
  nowMinutes: number;
  ignoreId?: string; // the booking being moved
  ignoreNotice?: boolean; // the team may book at short notice / in the past
}
export interface Slot {
  from: number;
  staffIds: string[]; // free resources, least busy first
}
const overlaps = (b: Booking, from: number, to: number, buffer: number) =>
  from < b.to + b.buffer && b.from < to + buffer;
// Free start times of a service on one day. No double booking: a resource is free when none
// of its bookings (plus their buffers) overlaps the appointment plus the service's buffer.
export function freeSlots(settings: BookingSettings, bookings: Booking[], q: SlotQuery): Slot[] {
  const service = settings.services.find((s) => s.id === q.serviceId);
  if (!service) return [];
  const today = dayNumber(q.today),
    target = dayNumber(q.date);
  if (!q.ignoreNotice && (target < today || target > today + settings.maxDays)) return [];
  const list = resources(settings, service, q.staffId, q.date);
  if (!list.length) return [];
  const sameDay = bookings.filter((b) => b.date === q.date && holdsTime(b.status) && b.id !== q.ignoreId);
  const earliest = today * 1440 + q.nowMinutes + settings.minNotice;
  const step = Math.max(5, settings.step);
  const capacity = Math.max(1, settings.capacity);
  const starts = new Map<number, string[]>();
  for (const r of list) {
    const own = r.id ? sameDay.filter((b) => b.staffId === r.id) : sameDay;
    for (const span of r.hours) {
      for (let from = span.from; from + service.duration <= span.to; from += step) {
        if (!q.ignoreNotice && target * 1440 + from < earliest) continue;
        const to = from + service.duration;
        const busy = own.filter((b) => overlaps(b, from, to, service.buffer)).length;
        if (busy >= (r.id ? 1 : capacity)) continue;
        starts.set(from, [...(starts.get(from) || []), r.id]);
      }
    }
  }
  const load = (id: string) => sameDay.filter((b) => b.staffId === id).length;
  return [...starts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([from, ids]) => ({ from, staffIds: ids.sort((a, b) => load(a) - load(b)) }));
}
// Dates (from today up to the limit) that still have at least one free slot.
export function openDays(settings: BookingSettings, bookings: Booking[], q: Omit<SlotQuery, "date">, from: string, to: string) {
  const days: string[] = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n++) {
    const date = dateOf(n);
    if (freeSlots(settings, bookings, { ...q, date }).length) days.push(date);
  }
  return days;
}

export const money = (n: number, currency = "EUR") =>
  `${Number.isInteger(n) ? n : n.toFixed(2)} ${currency === "EUR" ? "€" : currency}`;
