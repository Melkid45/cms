import { legacySiteId } from "@/lib/builder/server";
import { serveMedia } from "@/lib/builder/media-file";
// Media uploaded to the first website (and before multi-site support): /api/builder/media/{id}.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return serveMedia(legacySiteId, id, request);
}
