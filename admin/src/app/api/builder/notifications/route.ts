import { z } from "zod";
import {
  authorizeWrite,
  errorResponse,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import {
  listNotifications,
  markNotifications,
} from "@/lib/builder/notifications";
import { readRegistry, workspace } from "@/lib/builder/sites";
import type { Identity } from "@/lib/builder/access";
export const runtime = "nodejs";
// Team notifications (owner, designers) plus CRM notifications of the websites a client
// may open. Clients see only the latter.
const siteIds = async (viewer: Identity) =>
  viewer.role === "client"
    ? workspace(await readRegistry(), viewer).sites.map((s) => s.id)
    : [];
export async function GET(request: Request) {
  try {
    const viewer = await authorizeWrite(request);
    return Response.json(await listNotifications(viewer, await siteIds(viewer)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const viewer = await authorizeWrite(request);
    const parsed = z
      .object({
        ids: z.union([z.literal("all"), z.array(z.string().max(100)).max(500)]),
      })
      .strict()
      .safeParse(await readJson(request, 40000));
    if (!parsed.success) throw new StoreError("Choose notifications.");
    return Response.json(await markNotifications(viewer, parsed.data.ids, await siteIds(viewer)));
  } catch (error) {
    return errorResponse(error);
  }
}
