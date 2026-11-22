import { errorResponse } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { storeMedia } from "@/lib/builder/media";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    return await storeMedia(request, site.id);
  } catch (error) {
    return errorResponse(error);
  }
}
