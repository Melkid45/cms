import { authorizeWrite, errorResponse } from "@/lib/builder/server";
import { listSubmissions, updateSubmission } from "@/lib/builder/submissions";
import { StoreError } from "@/lib/builder/server";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    await authorizeWrite(request);
    return Response.json(await listSubmissions(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    await authorizeWrite(request);
    const value = z
      .object({
        id: z.string().max(100),
        read: z.boolean().optional(),
        internalNote: z.string().max(4000).optional(),
        revision: z.number().int().nonnegative().optional(),
      })
      .strict()
      .safeParse(await request.json());
    if (
      !value.success ||
      [value.data.read, value.data.internalNote].every((v) => v === undefined)
    )
      throw new StoreError("Choose an enquiry and a valid update.");
    const { id, ...patch } = value.data;
    if (patch.internalNote !== undefined && patch.revision === undefined)
      throw new StoreError("Refresh this enquiry before saving.");
    return Response.json(await updateSubmission(id, patch));
  } catch (error) {
    return errorResponse(error);
  }
}
