import { errorResponse, readJson } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import {
  deleteSubmissions,
  listSubmissions,
  updateSubmission,
} from "@/lib/builder/submissions";
import { StoreError } from "@/lib/builder/server";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    return Response.json(await listSubmissions(site.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const value = z
      .object({
        id: z.string().max(100),
        read: z.boolean().optional(),
        internalNote: z.string().max(4000).optional(),
        revision: z.number().int().nonnegative().optional(),
        flag: z.enum(["spam", "test"]).nullable().optional(),
      })
      .strict()
      .safeParse(await readJson(request, 12000));
    if (
      !value.success ||
      [value.data.read, value.data.internalNote, value.data.flag].every(
        (v) => v === undefined,
      )
    )
      throw new StoreError("Choose an enquiry and a valid update.");
    const { id, ...patch } = value.data;
    if (patch.internalNote !== undefined && patch.revision === undefined)
      throw new StoreError("Refresh this enquiry before saving.");
    return Response.json(await updateSubmission(site.id, id, patch));
  } catch (error) {
    return errorResponse(error);
  }
}
// Deletes one or more enquiries for good. Super admin only (Inbox is not a designer
// screen; clients can read and mark, not delete).
export async function DELETE(request: Request) {
  try {
    const { site } = await authorizeSite(request, true);
    const value = z
      .object({ ids: z.array(z.string().min(1).max(100)).min(1).max(500) })
      .strict()
      .safeParse(await readJson(request, 60000));
    if (!value.success) throw new StoreError("Choose enquiries to delete.");
    return Response.json(await deleteSubmissions(site.id, value.data.ids));
  } catch (error) {
    return errorResponse(error);
  }
}
