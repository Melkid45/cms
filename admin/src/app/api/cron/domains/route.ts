import { timingSafeEqual } from "node:crypto";
import { checkDueDomains } from "@/lib/builder/domains/store";
import { errorResponse } from "@/lib/builder/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Background re-check of custom domains (pending every minute it is called, active hourly).
// Not scheduled in vercel.json yet: see BUILDER.md → Custom domains.
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
    return Response.json(
      { checked: await checkDueDomains() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
