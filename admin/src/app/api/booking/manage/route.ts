import { z } from "zod";
import { after } from "next/server";
import { onBooking } from "@/lib/builder/crm/events";
import { assertSameOrigin, errorResponse, readJson, readProject, StoreError } from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import {
  bookingFacts,
  bookingIcs,
  bookingStore,
  updateBooking,
  validBookingToken,
} from "@/lib/builder/booking/store";
import { hhmm, validZone } from "@/lib/builder/booking/shared";
export const runtime = "nodejs";

// The customer's own booking, opened with the signed link from the success screen / e-mail:
// GET = summary (or `format=ics` = calendar file), POST {action:"cancel"} = cancel it.
// A wrong or missing token gets the same 404 as an unknown booking.
async function find(siteId: string, id: string, token: string) {
  if (!(await readRegistry()).sites.some((s) => s.id === siteId) || !/^[0-9a-f-]{36}$/.test(id) || !validBookingToken(siteId, id, token))
    throw new StoreError("Booking not found.", 404);
  const booking = await bookingStore(siteId, (d) => d.items.find((b) => b.id === id), false);
  if (!booking) throw new StoreError("Booking not found.", 404);
  return { booking, project: await readProject(siteId) };
}
const cancellable = (b: { status: string; start: string }) =>
  (b.status === "pending" || b.status === "confirmed") && Date.parse(b.start) > Date.now();
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (k: string) => url.searchParams.get(k) || "";
    const { booking: b, project } = await find(q("site"), q("id"), q("t"));
    if (q("format") === "ics")
      return new Response(bookingIcs(b, project.brand.name, project.website?.address || ""), {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="booking-${b.number}.ics"`,
          "Cache-Control": "no-store",
        },
      });
    return Response.json(
      {
        number: b.number,
        status: b.status,
        service: b.service,
        staff: b.staff,
        date: b.date,
        from: hhmm(b.from),
        to: hhmm(b.to),
        locale: b.locale,
        name: b.customer.name,
        business: project.brand.name,
        address: project.website?.address || "",
        phone: project.website?.phone || "",
        cancellable: cancellable(b),
      },
      { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = z
      .object({ site: z.string().max(40), id: z.string().max(40), t: z.string().max(64), action: z.literal("cancel") })
      .strict()
      .safeParse(await readJson(request, 2000));
    if (!input.success) throw new StoreError("Booking not found.", 404);
    const { site, id, t } = input.data;
    const { booking, project } = await find(site, id, t);
    if (booking.status === "cancelled") return Response.json({ ok: true, status: "cancelled" });
    if (!cancellable(booking)) throw new StoreError("This booking can no longer be cancelled online. Please call us.", 409);
    const { booking: saved } = await updateBooking(
      site,
      validZone(project.website?.timeZone),
      id,
      { revision: booking.revision, status: "cancelled" },
      "Customer",
    );
    after(() => onBooking(site, bookingFacts(saved), "cancelled", "Customer"));
    return Response.json({ ok: true, status: saved.status });
  } catch (error) {
    return errorResponse(error);
  }
}
