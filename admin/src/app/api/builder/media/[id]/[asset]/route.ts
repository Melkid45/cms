import { serveMedia } from "@/lib/builder/media-file";
// Media of other websites: /api/builder/media/{siteId}/{mediaId}.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; asset: string }> },
) {
  const { id, asset } = await params;
  return serveMedia(id, asset, request);
}
