import { errorResponse, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { STATE_COOKIE, startOAuth } from "@/lib/builder/social/accounts";

export const runtime = "nodejs";

// Owner starts connecting Facebook/Instagram ("meta") or TikTok for the selected
// website: redirect to the network's consent screen with a single-use state.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider } = await params;
    if (provider !== "meta" && provider !== "tiktok")
      throw new StoreError("Unknown network.", 404);
    const { site } = await authorizeSite(request, true);
    const { url, state } = await startOAuth(site.id, provider);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // Lax: sent back on the network's top-level redirect to the callback.
        "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/api/builder/social/oauth; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
