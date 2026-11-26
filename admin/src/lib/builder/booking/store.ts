import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { withDoc } from "../doc-store";
import { StoreError } from "../server";
import { mailConnection } from "../smtp";
import {
  defaultBookingSettings,
  freeSlots,
  hhmm,
  holdsTime,
  nowIn,
  validZone,
  zonedToUtc,
  BOOKING_STATUSES,
  type Booking,
  type BookingSettings,
  type BookingStatus,
} from "./shared";

// Bookings of one website: settings (services, staff, hours…) and appointments in one locked
// document `bookings:{siteId}` (PostgreSQL row or .data/bookings-{siteId}.json). Every new or
// moved booking is checked against the stored bookings inside the same lock, so two visitors
// can never take the same time.

interface BookingDoc {
  settings: BookingSettings;
  settingsRevision: number;
  next: number;
  items: Booking[];
}
const MAX_BOOKINGS = 20000;
const empty = (): BookingDoc => ({
  settings: defaultBookingSettings(),
  settingsRevision: 0,
  next: 1001,
  items: [],
});
export function bookingStore<T>(siteId: string, fn: (d: BookingDoc) => T | Promise<T>, write = true) {
  return withDoc<BookingDoc, T>(
    `bookings:${siteId}`,
    empty,
    (d) => {
      d.settings = { ...defaultBookingSettings(), ...d.settings };
      d.items ??= [];
      d.next ??= 1001;
      d.settingsRevision ??= 0;
      return fn(d);
    },
    write,
  );
}
export const readBookings = (siteId: string) =>
  bookingStore(siteId, (d) => ({ settings: d.settings, settingsRevision: d.settingsRevision, items: d.items }), false);

// ------------------------------------------------------------------ settings validation
const id = z.string().regex(/^[a-z0-9-]{1,40}$/);
const interval = z
  .object({ from: z.number().int().min(0).max(1440), to: z.number().int().min(0).max(1440) })
  .strict()
  .refine((i) => i.from < i.to, { message: "Opening time must be before closing time." });
const day = z.array(interval).max(4);
const week = z.array(day).length(7);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const name = (max: number) => z.string().trim().min(1).max(max);
export const settingsSchema = z
  .object({
    enabled: z.boolean(),
    services: z
      .array(
        z
          .object({
            id,
            name: name(120),
            duration: z.number().int().min(5).max(720),
            price: z.number().min(0).max(1000000),
            buffer: z.number().int().min(0).max(240),
            staffIds: z.array(id).max(50),
            active: z.boolean(),
          })
          .strict(),
      )
      .max(60),
    staff: z
      .array(
        z
          .object({
            id,
            name: name(120),
            role: z.string().trim().max(120),
            hours: week.nullable(),
            vacations: z
              .array(z.object({ from: ymd, to: ymd, note: z.string().trim().max(200) }).strict())
              .max(50),
            active: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    hours: week,
    holidays: z.array(z.object({ date: ymd, note: z.string().trim().max(200) }).strict()).max(200),
    step: z.number().int().min(5).max(240),
    minNotice: z.number().int().min(0).max(60 * 24 * 30),
    maxDays: z.number().int().min(1).max(365),
    autoConfirm: z.boolean(),
    capacity: z.number().int().min(1).max(50),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
  })
  .strict();
export const saveSettings = (siteId: string, settings: BookingSettings, revision: number) =>
  bookingStore(siteId, (d) => {
    if (d.settingsRevision !== revision)
      throw new StoreError("Booking settings were changed elsewhere. Refresh and try again.", 409);
    const ids = new Set(settings.staff.map((s) => s.id));
    if (ids.size !== settings.staff.length || new Set(settings.services.map((s) => s.id)).size !== settings.services.length)
      throw new StoreError("Duplicate service or staff ids.");
    for (const s of settings.services) s.staffIds = s.staffIds.filter((x) => ids.has(x));
    d.settings = settings;
    d.settingsRevision++;
    return { settings: d.settings, settingsRevision: d.settingsRevision };
  });

// ------------------------------------------------------------------ create / change
export interface BookingInput {
  serviceId: string;
  staffId: string; // "" = first free
  date: string;
  from: number;
  customer: Booking["customer"];
  comment: string;
  locale: string;
  pageId: string;
  source: Booking["source"];
  status?: BookingStatus;
  test?: boolean;
  force?: boolean; // team: ignore hours / overlaps (squeeze someone in)
}
export class SlotTaken extends StoreError {
  constructor() {
    super("That time was just taken. Please choose another time.", 409);
  }
}
function place(d: BookingDoc, timeZone: string, input: { serviceId: string; staffId: string; date: string; from: number; ignoreId?: string; team: boolean; force?: boolean }) {
  const settings = d.settings;
  const service = settings.services.find((s) => s.id === input.serviceId && (s.active || input.team));
  if (!service) throw new StoreError("Choose a service.");
  const now = nowIn(timeZone);
  let staffId = input.staffId;
  if (input.force && input.team) {
    if (staffId && !settings.staff.some((s) => s.id === staffId)) throw new StoreError("Choose a staff member.");
  } else {
    const slot = freeSlots(settings, d.items, {
      serviceId: service.id,
      staffId,
      date: input.date,
      today: now.date,
      nowMinutes: now.minutes,
      ignoreId: input.ignoreId,
      ignoreNotice: input.team,
    }).find((s) => s.from === input.from);
    if (!slot) throw new SlotTaken();
    staffId = staffId || slot.staffIds[0];
  }
  if (!staffId && settings.staff.some((s) => s.active)) throw new StoreError("Choose a staff member.");
  const staff = settings.staff.find((s) => s.id === staffId);
  const to = input.from + service.duration;
  return {
    serviceId: service.id,
    service: service.name,
    staffId: staff?.id || "",
    staff: staff?.name || "",
    date: input.date,
    from: input.from,
    to,
    buffer: service.buffer,
    start: zonedToUtc(input.date, input.from, timeZone).toISOString(),
    end: zonedToUtc(input.date, to, timeZone).toISOString(),
    price: service.price,
    currency: settings.currency,
  };
}
export function createBooking(siteId: string, timeZone: string, input: BookingInput, by: string) {
  const zone = validZone(timeZone);
  return bookingStore(siteId, (d) => {
    const team = input.source === "admin";
    if (!team && !d.settings.enabled) throw new StoreError("Online booking is not available.", 404);
    if (d.items.length >= MAX_BOOKINGS) throw new StoreError("Bookings are full. Please call us.", 503);
    const placed = place(d, zone, { ...input, team, force: input.force });
    const at = new Date().toISOString();
    const status: BookingStatus = input.status || (d.settings.autoConfirm ? "confirmed" : "pending");
    const booking: Booking = {
      id: randomUUID(),
      number: d.next++,
      createdAt: at,
      updatedAt: at,
      revision: 0,
      status,
      ...placed,
      customer: input.customer,
      comment: input.comment,
      locale: input.locale,
      pageId: input.pageId,
      source: input.source,
      note: "",
      email: "none",
      history: [{ at, status, by }],
      ...(input.test ? { test: true } : {}),
    };
    d.items.push(booking);
    return { booking, settings: d.settings };
  });
}
export interface BookingPatch {
  revision: number;
  status?: BookingStatus;
  note?: string;
  email?: Booking["email"];
  move?: { serviceId: string; staffId: string; date: string; from: number; force?: boolean };
  customer?: Booking["customer"];
}
export function updateBooking(siteId: string, timeZone: string, bookingId: string, patch: BookingPatch, by: string) {
  return bookingStore(siteId, (d) => {
    const b = d.items.find((x) => x.id === bookingId);
    if (!b) throw new StoreError("Booking not found.", 404);
    if (patch.revision !== b.revision)
      throw new StoreError("This booking was changed elsewhere. Refresh and try again.", 409);
    const at = new Date().toISOString();
    const before = { ...b };
    if (patch.move) {
      const placed = place(d, validZone(timeZone), { ...patch.move, ignoreId: b.id, team: true });
      Object.assign(b, placed);
      b.history.push({ at, status: b.status, by, text: `Moved to ${b.date} ${hhmm(b.from)}${b.staff ? ` · ${b.staff}` : ""}` });
    }
    if (patch.status && patch.status !== b.status) {
      // Re-opening a cancelled booking must not double-book its time.
      if (!holdsTime(b.status) && holdsTime(patch.status)) {
        const clash = d.items.some(
          (x) => x.id !== b.id && holdsTime(x.status) && x.date === b.date && x.staffId === b.staffId &&
            b.from < x.to + x.buffer && x.from < b.to + b.buffer,
        );
        if (clash && d.settings.staff.some((s) => s.active)) throw new SlotTaken();
      }
      b.status = patch.status;
      b.history.push({ at, status: patch.status, by });
    }
    if (patch.note !== undefined) b.note = patch.note;
    if (patch.email) b.email = patch.email;
    if (patch.customer) b.customer = patch.customer;
    b.revision++;
    b.updatedAt = at;
    b.history = b.history.slice(-50);
    return { booking: b, before };
  });
}
export const deleteBookings = (siteId: string, ids: string[]) =>
  bookingStore(siteId, (d) => {
    const n = d.items.length;
    d.items = d.items.filter((b) => !ids.includes(b.id));
    return { deleted: n - d.items.length };
  });
export const statusSchema = z.enum(BOOKING_STATUSES);

// ------------------------------------------------------------------ cancel link token
function key() {
  const secret = process.env.CMS_AUTH_SECRET || process.env.CMS_ADMIN_PASSWORD;
  if (!secret && process.env.NODE_ENV !== "development")
    throw new StoreError("Configure CMS_AUTH_SECRET before enabling bookings.", 503);
  return secret || "harbstone-local-development-only";
}
export const bookingToken = (siteId: string, bookingId: string) =>
  createHmac("sha256", key()).update(`booking:${siteId}:${bookingId}`).digest("base64url").slice(0, 32);
export function validBookingToken(siteId: string, bookingId: string, token: string) {
  const expected = Buffer.from(bookingToken(siteId, bookingId));
  const given = Buffer.from(token || "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
export const manageLink = (siteId: string, b: Booking, origin: string) =>
  `${origin}/booking/cancel?site=${encodeURIComponent(siteId)}&id=${b.id}&t=${bookingToken(siteId, b.id)}`;

// ------------------------------------------------------------------ texts (visitor side)
const TEXT = {
  en: { subject: "Booking #{n}", intro: "Thank you, your booking is received.", confirmed: "Your booking is confirmed.", pending: "We will confirm it shortly.", service: "Service", with: "Specialist", when: "Time", price: "Price", cancel: "Cancel or check the booking", cancelled: "Booking #{n} is cancelled." },
  lv: { subject: "Pieraksts Nr. {n}", intro: "Paldies, jūsu pieraksts ir saņemts.", confirmed: "Jūsu pieraksts ir apstiprināts.", pending: "Mēs to drīz apstiprināsim.", service: "Pakalpojums", with: "Speciālists", when: "Laiks", price: "Cena", cancel: "Atcelt vai pārbaudīt pierakstu", cancelled: "Pieraksts Nr. {n} ir atcelts." },
  ru: { subject: "Запись № {n}", intro: "Спасибо, ваша запись принята.", confirmed: "Ваша запись подтверждена.", pending: "Мы скоро её подтвердим.", service: "Услуга", with: "Специалист", when: "Время", price: "Цена", cancel: "Отменить или проверить запись", cancelled: "Запись № {n} отменена." },
  de: { subject: "Termin Nr. {n}", intro: "Danke, Ihr Termin ist eingegangen.", confirmed: "Ihr Termin ist bestätigt.", pending: "Wir bestätigen ihn in Kürze.", service: "Leistung", with: "Bei", when: "Zeit", price: "Preis", cancel: "Termin prüfen oder absagen", cancelled: "Termin Nr. {n} ist abgesagt." },
};
export const bookingText = (locale: string) => TEXT[(locale in TEXT ? locale : "en") as keyof typeof TEXT];
export function whenText(b: Booking, locale: string) {
  const d = new Date(b.date + "T12:00:00Z").toLocaleDateString(locale || "en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${d}, ${hhmm(b.from)}–${hhmm(b.to)}`;
}

// .ics calendar file (RFC 5545) of one booking.
const icsEscape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
const icsDate = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function bookingIcs(b: Booking, business: string, location: string) {
  const fold = (line: string) => line.match(/.{1,70}/g)?.join("\r\n ") || line;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Harbstone CMS//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@harbstone`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(b.start)}`,
    `DTEND:${icsDate(b.end)}`,
    fold(`SUMMARY:${icsEscape(`${b.service} — ${business}`)}`),
    location ? fold(`LOCATION:${icsEscape(location)}`) : "",
    fold(`DESCRIPTION:${icsEscape(`#${b.number}${b.staff ? ` · ${b.staff}` : ""}`)}`),
    b.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

// Confirmation e-mail to the customer with the .ics attached (no-op without SMTP / e-mail).
export async function confirmToCustomer(
  siteId: string,
  b: Booking,
  business: { name: string; address?: string; phone?: string; email?: string },
  link: string,
): Promise<Booking["email"]> {
  if (!b.customer.email) return "none";
  const t = bookingText(b.locale);
  let connection: Awaited<ReturnType<typeof mailConnection>> = null;
  try {
    connection = await mailConnection(siteId);
    if (!connection) return "none";
    const name = business.name.replace(/[\r\n]/g, " ").slice(0, 80);
    await connection.transport.sendMail({
      from: connection.from,
      to: b.customer.email,
      replyTo: business.email || connection.replyTo || undefined,
      subject: `${name}: ${t.subject.replace("{n}", String(b.number))}`,
      text: [
        t.intro,
        b.status === "confirmed" ? t.confirmed : t.pending,
        "",
        `${t.service}: ${b.service}`,
        b.staff ? `${t.with}: ${b.staff}` : "",
        `${t.when}: ${whenText(b, b.locale)}`,
        b.price ? `${t.price}: ${b.price} ${b.currency}` : "",
        "",
        `${t.cancel}: ${link}`,
        "",
        name,
        [business.address, business.phone, business.email].filter(Boolean).join(" · "),
      ]
        .filter((l, i, a) => l !== "" || a[i - 1] !== "")
        .join("\n"),
      icalEvent: { filename: "booking.ics", method: "PUBLISH", content: bookingIcs(b, name, business.address || "") },
    });
    return "sent";
  } catch {
    return "failed";
  } finally {
    connection?.transport.close();
  }
}

// What the CRM hook needs to know about a booking.
export const bookingFacts = (b: Booking) => ({
  id: b.id,
  number: b.number,
  service: b.service,
  staff: b.staff,
  when: `${b.date} ${hhmm(b.from)}`,
  status: b.status,
  customer: b.customer,
  locale: b.locale,
  price: b.price,
  currency: b.currency,
  ...(b.test ? { test: true } : {}),
});
