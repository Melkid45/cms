import { authorizeWrite, errorResponse } from "@/lib/builder/server";
import { readOrderFile } from "@/lib/builder/orders";
export const runtime = "nodejs";
// Private download of a client brief document for the team.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  try {
    const viewer = await authorizeWrite(request, "design");
    const { id, file } = await params;
    const { meta, bytes } = await readOrderFile(id, file, viewer);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": meta.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
