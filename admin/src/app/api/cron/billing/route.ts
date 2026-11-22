import { timingSafeEqual } from "node:crypto";
import { runBilling } from "@/lib/builder/billing";
import { errorResponse } from "@/lib/builder/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Daily: renewal invoices, overdue reminders, suspension after the grace period.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runBilling(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
