import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/lib/builder/server";
import { publishDuePosts } from "@/lib/builder/social/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Publishes scheduled social posts that are due (Bearer CRON_SECRET, like
// /api/cron/backups). A no-op for websites without connected accounts.
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
    return Response.json(await publishDuePosts(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
