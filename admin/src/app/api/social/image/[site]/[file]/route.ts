import { renderJpeg } from "@/lib/builder/social/render";

export const runtime = "nodejs";

// Public JPEG copy of a social render (/api/social/image/{siteId}/{mediaId}.jpg):
// Instagram pulls JPEG only, TikTok pulls from the verified admin domain. Only media
// whose name starts with "social-" are served; everything else is 404.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ site: string; file: string }> },
) {
  const { site, file } = await params;
  const id = file.replace(/\.jpe?g$/, "");
  if (!/^[a-z0-9]{1,40}$/.test(site) || !/^[a-f0-9-]{36}$/.test(id))
    return new Response(null, { status: 404 });
  try {
    const bytes = await renderJpeg(site, id);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public,max-age=86400",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
