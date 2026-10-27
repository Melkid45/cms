import { authorizeWrite, errorResponse } from "@/lib/builder/server";
import { listSubmissions, markSubmission } from "@/lib/builder/submissions";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    authorizeWrite(request);
    return Response.json(await listSubmissions(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    authorizeWrite(request);
    const value = z
      .object({ id: z.string(), read: z.boolean() })
      .parse(await request.json());
    return Response.json(await markSubmission(value.id, value.read));
  } catch (error) {
    return errorResponse(error);
  }
}
