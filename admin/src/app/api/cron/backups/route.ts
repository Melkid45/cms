import { timingSafeEqual } from "node:crypto";
import { pruneExpiredBackups } from "@/lib/builder/backups";
import { errorResponse } from "@/lib/builder/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      { removed: await pruneExpiredBackups() },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
