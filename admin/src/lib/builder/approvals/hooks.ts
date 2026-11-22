import "server-only";
import { socialOnPublish } from "./providers/social";
import { dispatch } from "./service";

// Admin base address (webhook URL, links): NEXT_PUBLIC_SITE_URL, else the address the request
// came through (tunnel / local).
export function adminBase(request: Request) {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (/^https?:\/\//.test(configured)) return configured;
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(request.url).protocol.replace(":", "");
    return `${proto === "https" ? "https" : "http"}://${forwarded.split(",")[0].trim()}`;
  }
  return new URL(request.url).origin;
}

// After a page is published: draft social posts for new cards/pages, then send what is due.
// Never throws (runs in after()).
export async function approvalsAfterPublish(siteId: string, siteKey: string, pageId: string, baseUrl: string) {
  try {
    const created = await socialOnPublish(siteId, siteKey, pageId, baseUrl);
    if (created) await dispatch(siteId);
  } catch (error) {
    console.error("approvals: after publish failed", error instanceof Error ? error.message : "");
  }
}
