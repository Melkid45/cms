import { errorResponse } from "@/lib/builder/server";
import { publicPrices } from "@/lib/builder/billing";
export const runtime = "nodejs";
// Packages and hosting prices shown on the public order page.
export async function GET() {
  try {
    return Response.json(await publicPrices(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
