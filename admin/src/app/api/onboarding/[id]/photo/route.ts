import { errorResponse, StoreError } from "@/lib/builder/server";
import { storeMedia } from "@/lib/builder/media";
import { authorizeOnboarding, changeRecord } from "@/lib/builder/onboarding/store";

export const runtime = "nodejs";
// Client photos for the new website: stored in the website's media library through the
// normal upload pipeline (validated, resized, metadata stripped, WebP), max 30 per onboarding.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host))
      throw new StoreError("Invalid origin.", 403);
    const { record } = await authorizeOnboarding(request, id);
    if (record.photos.length >= 30) throw new StoreError("Up to 30 photos.");
    if (!/^multipart\/form-data/i.test(request.headers.get("content-type") || ""))
      throw new StoreError("Choose an image.");
    const response = await storeMedia(request, record.siteId);
    const data = (await response.json()) as { asset?: { url: string; mime: string }; error?: string };
    if (!response.ok || !data.asset) throw new StoreError(data.error || "Upload failed.", response.status || 400);
    if (!data.asset.mime.startsWith("image/")) throw new StoreError("Choose an image.");
    const url = data.asset.url;
    await changeRecord(id, (record) => {
      if (!record.photos.includes(url)) record.photos.push(url);
    });
    return Response.json({ url });
  } catch (error) {
    return errorResponse(error);
  }
}
