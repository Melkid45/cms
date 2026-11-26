import { execFile } from "node:child_process";
import path from "node:path";
import content from "@/lib/builder/site-css-content.json";
import { order } from "@/lib/builder/site-css.json";
// The library CSS of one public page: /api/site-css/base+header+…+site.<hash>.css = those parts of
// site.scss concatenated in site.scss order (lib/builder/site-css.ts, scripts/build-site-css.mjs).
// Production serves the prebuilt parts with an immutable cache (the hash changes with the CSS);
// development compiles them live from the SCSS, so template edits show without a rebuild.
const css = content as Record<string, string>;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bundle: string }> },
) {
  const { bundle } = await params;
  const match = /^([a-z0-9-]+(?:\+[a-z0-9-]+)*)(?:\.[a-f0-9]{10}\.css)?$/.exec(bundle);
  const ids = match?.[1].split("+") || [];
  // Known parts only, each once, in site.scss order: the cascade must not depend on the URL.
  if (!ids.length || ids.some((id, i) => !order.includes(id) || (i && order.indexOf(id) <= order.indexOf(ids[i - 1]))))
    return new Response(null, { status: 404 });
  if (process.env.NODE_ENV === "development") {
    const live = await new Promise<string | null>((resolve) =>
      execFile(
        process.execPath,
        [path.join(process.cwd(), "scripts/site-css-parts.mjs"), ids.join("+")],
        { maxBuffer: 8 * 1024 * 1024 },
        (error, stdout) => resolve(error ? null : stdout),
      ),
    );
    if (live === null) return new Response(null, { status: 404 });
    return new Response(live, {
      headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(ids.map((id) => css[id]).join("\n"), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
