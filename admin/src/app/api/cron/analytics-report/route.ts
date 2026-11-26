import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import { readAnalyticsConfig } from "@/lib/builder/analytics-config";
import { sendWeeklyReport } from "@/lib/builder/analytics-weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weekly analytics report (BUILDER.md → Analytics → Weekly report). Bearer CRON_SECRET like
// /api/cron/backups. Sends only for websites that switched a channel on, at most once in 6 days;
// websites without a channel are skipped (no-op).
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
    const results: Record<string, Record<string, string>> = {};
    const now = Date.now();
    for (const site of (await readRegistry()).sites) {
      const config = await readAnalyticsConfig(site.id).catch(() => null);
      if (!config || (!config.weekly.email && !config.weekly.telegram)) continue;
      const last = config.weekly.lastSent ? Date.parse(config.weekly.lastSent) : 0;
      if (last && now - last < 6 * 86_400_000) continue;
      results[site.id] = await sendWeeklyReport(site.id).catch(() => ({ error: "failed" }));
    }
    return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
