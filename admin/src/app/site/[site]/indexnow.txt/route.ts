import { siteByKey } from "@/lib/builder/sites";
import { indexNowKey } from "@/lib/builder/seo/indexnow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// /site/{key}/indexnow.txt: the website's IndexNow key (keyLocation of the pings).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ site: string }> },
) {
  const site = await siteByKey((await params).site);
  if (!site) return new Response("Not found", { status: 404 });
  return new Response(indexNowKey(site.id), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
