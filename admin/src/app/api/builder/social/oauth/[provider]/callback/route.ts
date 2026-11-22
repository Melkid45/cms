import { StoreError } from "@/lib/builder/server";
import { cookieValue } from "@/lib/builder/sites";
import {
  finishMeta,
  finishTikTok,
  publicBase,
  STATE_COOKIE,
} from "@/lib/builder/social/accounts";

export const runtime = "nodejs";

// Redirect URI registered in the Meta / TikTok app:
//   {NEXT_PUBLIC_SITE_URL}/api/builder/social/oauth/meta/callback
//   {NEXT_PUBLIC_SITE_URL}/api/builder/social/oauth/tiktok/callback
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const query = new URL(request.url).searchParams;
  const back = (result: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${publicBase()}/dashboard/settings/social?result=${encodeURIComponent(result)}`,
        "Set-Cookie": `${STATE_COOKIE}=; Path=/api/builder/social/oauth; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
      },
    });
  try {
    if (provider !== "meta" && provider !== "tiktok")
      throw new StoreError("Unknown network.", 404);
    const code = query.get("code"),
      state = query.get("state") || "";
    if (!code) return back(query.get("error_description") || query.get("error") || "Cancelled.");
    const finish = provider === "meta" ? finishMeta : finishTikTok;
    await finish(code, state, cookieValue(request, STATE_COOKIE));
    return back("connected");
  } catch (error) {
    return back(error instanceof StoreError ? error.message : "Could not connect.");
  }
}
