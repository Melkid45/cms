import { z } from "zod";
import { after } from "next/server";
import { onBooking } from "@/lib/builder/crm/events";
import {
  assertSameOrigin,
  clientIp,
  errorResponse,
  readJson,
  readProject,
  StoreError,
} from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import { limitBookings, validateFormToken } from "@/lib/builder/submissions";
import { formMessage } from "@/lib/builder/i18n";
import {
  bookingFacts,
  bookingStore,
  bookingToken,
  confirmToCustomer,
  createBooking,
  manageLink,
  SlotTaken,
  updateBooking,
} from "@/lib/builder/booking/store";
import {
  addDays,
  freeSlots,
  hhmm,
  nowIn,
  openDays,
  servicesStaff,
  validZone,
} from "@/lib/builder/booking/shared";
export const runtime = "nodejs";

// Public online booking of a website (widget contact-v60). GET: services/staff, open days of
// a month, free times of a day — all computed on the server from the hours minus the stored
// bookings. POST: books a time; the slot is re-checked inside the locked store (no double
// booking). Protected like enquiry forms: signed page token, honeypot, per-visitor limit.
async function siteOf(siteId: string) {
  if (!(await readRegistry()).sites.some((s) => s.id === siteId)) throw new StoreError("Form unavailable.", 404);
  const project = await readProject(siteId);
  return { project, zone: validZone(project.website?.timeZone) };
}
// Address of the admin app for links in e-mails (the public URL setting, else the request host).
function publicOrigin(request: Request) {
  const env = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (/^https?:\/\//.test(env)) return env;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
const noStore = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (k: string) => url.searchParams.get(k) || "";
    const { zone } = await siteOf(q("site"));
    const { settings, items } = await bookingStore(q("site"), (d) => ({ settings: d.settings, items: d.items }), false);
    if (!settings.enabled) throw new StoreError("Online booking is not available.", 404);
    const now = nowIn(zone);
    const serviceId = q("service");
    if (!serviceId) {
      const services = settings.services.filter((s) => s.active);
      return Response.json(
        {
          services: services.map((s) => ({ id: s.id, name: s.name, duration: s.duration, price: s.price })),
          staff: settings.staff
            .filter((s) => s.active)
            .map((s) => ({
              id: s.id,
              name: s.name,
              role: s.role,
              services: services.filter((x) => servicesStaff(settings, x).some((y) => y.id === s.id)).map((x) => x.id),
            })),
          currency: settings.currency,
          today: now.date,
          last: addDays(now.date, settings.maxDays),
          timeZone: zone,
        },
        { headers: noStore },
      );
    }
    const base = { serviceId, staffId: q("staff"), today: now.date, nowMinutes: now.minutes };
    const month = q("month");
    if (/^\d{4}-\d{2}$/.test(month)) {
      const first = `${month}-01`;
      const [y, m] = month.split("-").map(Number);
      const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
      const from = first < now.date ? now.date : first;
      const limit = addDays(now.date, settings.maxDays);
      const to = last > limit ? limit : last;
      return Response.json({ days: from <= to ? openDays(settings, items, base, from, to) : [] }, { headers: noStore });
    }
    const date = q("date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new StoreError("Choose a date.");
    return Response.json(
      { slots: freeSlots(settings, items, { ...base, date }).map((s) => hhmm(s.from)) },
      { headers: noStore },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  site: z.string().min(1).max(40),
  pageId: z.string().min(1).max(100),
  token: z.string().max(1000),
  website: z.string().max(500).default(""),
  locale: z.string().max(10).optional(),
  serviceId: z.string().min(1).max(40),
  staffId: z.string().max(40).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  name: text(160).min(1),
  phone: z.string().trim().regex(/^\+?[\d\s().-]{6,40}$/),
  email: z.union([z.literal(""), z.email().max(254)]).default(""),
  comment: text(2000).default(""),
});
export async function POST(request: Request) {
  let locale: string | undefined;
  try {
    assertSameOrigin(request);
    const raw = (await readJson(request, 20000)) as { locale?: unknown };
    locale = typeof raw?.locale === "string" ? raw.locale : undefined;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      throw new StoreError(
        field === "email" ? "Enter a valid email address." : field === "phone" ? "Enter a valid phone number." : "Check the form fields.",
      );
    }
    const input = parsed.data;
    if (input.website) return Response.json({ ok: true });
    if (!validateFormToken(input.token, input.pageId, input.site))
      throw new StoreError("Please reload the page and try again.", 403);
    const { project, zone } = await siteOf(input.site);
    const page = project.pages.find(
      (p) =>
        p.id === input.pageId &&
        !p.deletedAt &&
        p.published?.sections.some((s) => s.variant === "contact-v60" && !s.hidden),
    );
    if (!page || project.forms?.enabled === false) throw new StoreError("Form unavailable.", 404);
    locale = page.published!.locale || project.languages?.default || locale;
    await limitBookings(clientIp(request));
    const [h, m] = input.time.split(":").map(Number);
    const { booking } = await createBooking(
      input.site,
      zone,
      {
        serviceId: input.serviceId,
        staffId: input.staffId,
        date: input.date,
        from: h * 60 + m,
        customer: { name: input.name, phone: input.phone, email: input.email },
        comment: input.comment,
        locale: locale || "",
        pageId: page.id,
        source: "website",
        test: /\bTEST\b/.test(input.name),
      },
      "Website",
    );
    // CRM contact + timeline, bell and Telegram after the response.
    after(() => onBooking(input.site, bookingFacts(booking), "new"));
    const origin = publicOrigin(request);
    const link = manageLink(input.site, booking, origin);
    const email = await confirmToCustomer(
      input.site,
      booking,
      {
        name: project.brand.name,
        address: project.website?.address,
        phone: project.website?.phone,
        email: project.website?.contactEmail,
      },
      link,
    );
    if (email !== "none")
      await updateBooking(input.site, zone, booking.id, { revision: booking.revision, email }, "Website").catch(() => {});
    const t = bookingToken(input.site, booking.id);
    return Response.json({
      ok: true,
      id: booking.id,
      number: booking.number,
      status: booking.status,
      service: booking.service,
      staff: booking.staff,
      date: booking.date,
      from: hhmm(booking.from),
      to: hhmm(booking.to),
      email,
      ics: `/api/booking/manage?site=${encodeURIComponent(input.site)}&id=${booking.id}&t=${t}&format=ics`,
      manage: `/booking/cancel?site=${encodeURIComponent(input.site)}&id=${booking.id}&t=${t}`,
    });
  } catch (error) {
    if (error instanceof SlotTaken) return Response.json({ error: "taken", code: "taken" }, { status: 409 });
    const response = errorResponse(error);
    const body = (await response.json()) as { error: string };
    return Response.json({ error: formMessage(locale, body.error) }, { status: response.status });
  }
}
