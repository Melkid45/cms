import { z } from "zod";
import { authorizeWrite, errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { approveReviewItem, listApprovalItems, reviseReviewItem } from "@/lib/builder/onboarding/review";

export const runtime = "nodejs";
export const maxDuration = 90;
// Onboarding review items for other channels (approvals bot). Super admin session.
// GET ?status=pending|approved|changes|all&site=<siteId> → ApprovalItem[]
// POST {id, action: "approve"} | {id, action: "change", text} → {item, cost?, model?}
export async function GET(request: Request) {
  try {
    await authorizeWrite(request, true);
    const url = new URL(request.url);
    const status = z
      .enum(["pending", "approved", "changes", "all"])
      .catch("pending")
      .parse(url.searchParams.get("status") ?? "pending");
    return Response.json(
      await listApprovalItems({ status, siteId: url.searchParams.get("site") || undefined }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
const input = z.discriminatedUnion("action", [
  z.object({ id: z.string().max(100), action: z.literal("approve") }).strict(),
  z
    .object({ id: z.string().max(100), action: z.literal("change"), text: z.string().trim().min(2).max(2000) })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    const identity = await authorizeWrite(request, true);
    const parsed = input.safeParse(await readJson(request, 8000));
    if (!parsed.success) throw new StoreError("Invalid request.");
    const by = identity.name || identity.email;
    if (parsed.data.action === "approve")
      return Response.json({ item: await approveReviewItem(parsed.data.id, by) });
    return Response.json(await reviseReviewItem(parsed.data.id, parsed.data.text, by));
  } catch (error) {
    return errorResponse(error);
  }
}
