import { authorizeWrite, errorResponse } from "@/lib/builder/server";
import { storeMedia } from "@/lib/builder/media";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    authorizeWrite(request);
    return await storeMedia(request);
  } catch (error) {
    return errorResponse(error);
  }
}
