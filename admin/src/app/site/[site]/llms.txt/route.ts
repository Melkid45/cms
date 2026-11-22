import { llmsResponse } from "@/lib/builder/seo/llms-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// /site/{key}/llms.txt: the website and its pages for AI assistants (SEO pack).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ site: string }> },
) {
  return llmsResponse(request, (await params).site, false);
}
