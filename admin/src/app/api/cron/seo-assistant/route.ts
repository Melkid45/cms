import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import { monthlyTick } from "@/lib/builder/seo/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Monthly AI SEO assistant run (BUILDER.md → AI SEO assistant). Bearer CRON_SECRET like
// /api/cron/backups. Only websites with the SEO pack and "Monthly run" switched on, once per
// month each; everything else is skipped (no-op). Sends last month's report when enabled.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const results: Record<string, unknown> = {};
    for (const site of (await readRegistry()).sites) {
      const result = await monthlyTick(site.id, site.key).catch((e) => ({ error: e instanceof Error ? e.message : "failed" }));
      if (result) results[site.id] = result;
    }
    return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
