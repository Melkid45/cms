import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import { dispatch, syncProviders } from "@/lib/builder/approvals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Approvals of every website (Bearer CRON_SECRET, like /api/cron/crm): pull new items from
// the modules (SEO assistant…) and send what is due (instant items after quiet hours, the
// daily digest). Run hourly; the dashboard and the poller also send while they are open.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let sent = 0;
    for (const site of (await readRegistry()).sites) {
      await syncProviders(site.id).catch(() => 0);
      sent += await dispatch(site.id).catch(() => 0);
    }
    return Response.json({ sent }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
