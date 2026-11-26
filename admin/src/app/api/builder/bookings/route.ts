import { z } from "zod";
import { after } from "next/server";
import { errorResponse, readJson, readProject, StoreError } from "@/lib/builder/server";
import { crmAccess } from "@/lib/builder/crm/access";
import { onBooking } from "@/lib/builder/crm/events";
import {
  bookingFacts,
  createBooking,
  deleteBookings,
  readBookings,
  saveSettings,
  settingsSchema,
  statusSchema,
  updateBooking,
} from "@/lib/builder/booking/store";
import { nowIn, validZone } from "@/lib/builder/booking/shared";

// Bookings of the selected website (dashboard → Bookings): the super admin and the website's
// clients run them; designers get 403 like the CRM. Deleting bookings: super admin only.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minutes = z.number().int().min(0).max(1439);
const customer = z
  .object({
    name: z.string().trim().min(1).max(160),
    phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[\d\s().-]{6,40}$/)]),
    email: z.union([z.literal(""), z.email().max(254)]),
  })
  .strict();
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), revision: z.number().int().nonnegative(), settings: settingsSchema }).strict(),
  z
    .object({
      action: z.literal("create"),
      serviceId: z.string().min(1).max(40),
      staffId: z.string().max(40).default(""),
      date,
      from: minutes,
      customer,
      comment: z.string().trim().max(2000).default(""),
      status: statusSchema.optional(),
      force: z.boolean().optional(),
      test: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      id: z.string().min(1).max(40),
      revision: z.number().int().nonnegative(),
      status: statusSchema.optional(),
      note: z.string().max(4000).optional(),
      customer: customer.optional(),
      move: z
        .object({ serviceId: z.string().min(1).max(40), staffId: z.string().max(40), date, from: minutes, force: z.boolean().optional() })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ action: z.literal("delete"), ids: z.array(z.string().min(1).max(40)).min(1).max(500) }).strict(),
]);
async function zoneOf(siteId: string) {
  return validZone((await readProject(siteId)).website?.timeZone);
}
export async function GET(request: Request) {
  try {
    const { site } = await crmAccess(request);
    const zone = await zoneOf(site.id);
    const data = await readBookings(site.id);
    const now = nowIn(zone);
    return Response.json(
      { ...data, timeZone: zone, today: now.date, nowMinutes: now.minutes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { site, identity } = await crmAccess(request);
    const parsed = action.safeParse(await readJson(request, 200000));
    if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message || "Check the fields.");
    const input = parsed.data;
    const by = identity.name || identity.email || "Team";
    if (input.action === "settings") return Response.json(await saveSettings(site.id, input.settings, input.revision));
    if (input.action === "delete") {
      if (identity.role !== "super-admin") throw new StoreError("Only the administrator can delete bookings.", 403);
      return Response.json(await deleteBookings(site.id, input.ids));
    }
    const zone = await zoneOf(site.id);
    if (input.action === "create") {
      const { booking } = await createBooking(
        site.id,
        zone,
        {
          serviceId: input.serviceId,
          staffId: input.staffId,
          date: input.date,
          from: input.from,
          customer: input.customer,
          comment: input.comment,
          locale: "",
          pageId: "",
          source: "admin",
          status: input.status || "confirmed",
          force: input.force,
          test: input.test,
        },
        by,
      );
      after(() => onBooking(site.id, bookingFacts(booking), "changed", by));
      return Response.json(booking);
    }
    const { id, ...patch } = input;
    delete (patch as { action?: string }).action;
    const { booking, before } = await updateBooking(site.id, zone, id, patch, by);
    if (booking.status !== before.status || patch.move)
      after(() => onBooking(site.id, bookingFacts(booking), "changed", by));
    return Response.json(booking);
  } catch (error) {
    return errorResponse(error);
  }
}
