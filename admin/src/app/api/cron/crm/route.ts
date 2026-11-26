import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import { remindDueTasks } from "@/lib/builder/crm/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Task reminders of every website (Bearer CRON_SECRET, like /api/cron/backups). The
// dashboard also sends them while it is open; this covers the time nobody is signed in.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let reminded = 0;
    for (const site of (await readRegistry()).sites)
      reminded += await remindDueTasks(site.id).catch(() => 0);
    return Response.json({ reminded }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
