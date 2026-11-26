import { StoreError } from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import { siteSuspended } from "@/lib/builder/billing";
import { ogImage } from "@/lib/builder/seo/server";
import { seoPack } from "@/lib/builder/seo/pack";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/seo/og/{siteId}/{pageId}.jpg: automatic 1200×630 share image of a published page
// without its own image (hero image + title in the website's colours and fonts).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ site: string; image: string }> },
) {
  const { site: siteId, image } = await params;
  const pageId = image.replace(/\.jpg$/, "");
  if (!/^[a-z0-9]{1,40}$/.test(siteId) || !/^[\w-]{1,100}$/.test(pageId))
    return new Response("Not found", { status: 404 });
  const registry = await readRegistry();
  if (
    !registry.sites.some((s) => s.id === siteId) ||
    (await siteSuspended(siteId)) ||
    !(await seoPack(siteId))
  )
    return new Response("Not found", { status: 404 });
  try {
    const result = await ogImage(siteId, pageId);
    if ("url" in result) return Response.redirect(result.url!, 302);
    return new Response(new Uint8Array(result.bytes!), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    if (error instanceof StoreError && error.status === 404)
      return new Response("Not found", { status: 404 });
    return new Response("Could not render the image.", { status: 500 });
  }
}
