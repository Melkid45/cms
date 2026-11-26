import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { readProject, siteDirectory } from "./server";
import { MEDIA_WIDTHS } from "./responsive-image";
// File extension of a stored media item: images are WebP, background videos keep MP4/WebM.
const extension = (mime: string) =>
  mime === "video/mp4" ? "mp4" : mime === "video/webm" ? "webm" : "webp";
// Serves a locally stored image or video of one website (local storage only; Blob URLs are public).
// Videos answer byte ranges, which Safari needs to play them.
export async function serveMedia(siteId: string, id: string, request?: Request) {
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-z0-9]{1,40}$/.test(siteId))
    return new Response(null, { status: 404 });
  try {
    const project = await readProject(siteId);
    // ?w=640: a resized copy for srcset (lib/builder/responsive-image.ts).
    const width = Number(new URL(request?.url || "http://x").searchParams.get("w"));
    if (MEDIA_WIDTHS.includes(width)) {
      const data = await variant(siteId, id, width, project.media);
      if (!data) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(data), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public,max-age=31536000,s-maxage=31536000,immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const mime =
      project.media.find((asset) => asset.url.endsWith(`/${id}`))?.mime ||
      "image/webp";
    const data = await readFile(
      path.join(siteDirectory(siteId), "media", `${id}.${extension(mime)}`),
    );
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Cache-Control": "public,max-age=31536000,immutable",
      "X-Content-Type-Options": "nosniff",
    };
    if (!mime.startsWith("video/")) return new Response(data, { headers });
    headers["Accept-Ranges"] = "bytes";
    const range = /^bytes=(\d*)-(\d*)$/.exec(request?.headers.get("range") || "");
    if (!range || (!range[1] && !range[2])) return new Response(data, { headers });
    let start = range[1] ? Number(range[1]) : data.length - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : data.length - 1;
    start = Math.max(0, start);
    end = Math.min(end, data.length - 1);
    if (start > end)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${data.length}` },
      });
    return new Response(data.subarray(start, end + 1), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${data.length}`,
        "Content-Length": String(end - start + 1),
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

// Resized WebP copy of an uploaded image, made once and kept next to the original
// (media/w/{id}-{width}.webp; Blob-only installations keep it in memory per instance
// and rely on the CDN cache). The source is the local file or the Blob upload.
const making = new Map<string, Promise<Buffer | null>>();
function variant(
  siteId: string,
  id: string,
  width: number,
  media: { url: string; mime: string }[],
) {
  const key = `${siteId}/${id}/${width}`;
  let job = making.get(key);
  if (!job) {
    job = makeVariant(siteId, id, width, media);
    making.set(key, job);
    // Keep finished jobs only briefly: the file cache or the CDN serves repeats.
    job.finally(() => setTimeout(() => making.delete(key), 60_000));
  }
  return job;
}
async function makeVariant(
  siteId: string,
  id: string,
  width: number,
  media: { url: string; mime: string }[],
) {
  const folder = path.join(siteDirectory(siteId), "media");
  const cached = path.join(folder, "w", `${id}-${width}.webp`);
  try {
    return await readFile(cached);
  } catch {}
  const asset = media.find(
    (m) => m.url.endsWith(`/${id}`) || m.url.endsWith(`/${id}.webp`),
  );
  if (!asset || asset.mime.startsWith("video/")) return null;
  let source: Buffer;
  try {
    source = await readFile(path.join(folder, `${id}.webp`));
  } catch {
    if (!/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//.test(asset.url))
      return null;
    const response = await fetch(asset.url);
    if (!response.ok) return null;
    source = Buffer.from(await response.arrayBuffer());
  }
  const data = await sharp(source, { limitInputPixels: 40000000 })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
  try {
    await mkdir(path.dirname(cached), { recursive: true, mode: 0o700 });
    await writeFile(cached, data, { mode: 0o600 });
  } catch {
    // Read-only file system (serverless): the CDN cache keeps the copy.
  }
  return data;
}
