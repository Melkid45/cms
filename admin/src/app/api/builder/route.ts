import {
  readProject,
  writeProject,
  errorResponse,
  readJson,
} from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { after } from "next/server";
import { afterPublish } from "@/lib/builder/seo/publish";
import { adminBase, approvalsAfterPublish } from "@/lib/builder/approvals/hooks";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    return Response.json(await readProject(site.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    const { identity, site } = await authorizeSite(request);
    const publishId = new URL(request.url).searchParams.get("publish");
    // SEO after publishing: pre-render the share image, ping IndexNow (lib/builder/seo/publish.ts).
    if (publishId) after(() => afterPublish(site.id, publishId));
    // Approvals: a draft social post for new product/work cards (lib/builder/approvals).
    if (publishId) {
      const base = adminBase(request);
      after(() => approvalsAfterPublish(site.id, site.key, publishId, base));
    }
    return Response.json(
      await writeProject(
        await readJson(request, 16 * 1024 * 1024),
        new URL(request.url).searchParams.get("publish") || undefined,
        identity.role,
        {
          autosave: new URL(request.url).searchParams.get("autosave") === "1",
          siteId: site.id,
        },
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
