import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { del, put } from "@vercel/blob";
import {
  legacySiteId,
  localMediaUrl,
  readProject,
  siteDirectory,
  StoreError,
  writeProject,
} from "../server";
import { FONT_PAIRS } from "../font-pairs";
import type { Media, Project } from "../types";
import { FORMATS, type FormatId, type PostRender, type SocialPost } from "./shared";

const MAX_BYTES = 12 * 1024 * 1024;

// Bytes of an image of this website: local media, public /images|/brand files or the
// website's own Vercel Blob media. Anything else is refused (no arbitrary fetches).
export async function mediaBytes(siteId: string, url: string): Promise<Buffer> {
  if (url.startsWith("/api/builder/media/")) {
    const parts = url.slice("/api/builder/media/".length).split(/[/?#]/);
    const local = parts.length >= 2 && /^[a-z0-9]{1,40}$/.test(parts[0]);
    const owner = local ? parts[0] : legacySiteId,
      id = local ? parts[1] : parts[0];
    if (!/^[a-f0-9-]{36}$/.test(id) || owner !== siteId)
      throw new StoreError("Use an image from this website's media library.");
    return readFile(path.join(siteDirectory(owner), "media", id + ".webp"));
  }
  if (/^\/(images|brand)\//.test(url)) {
    const root = path.join(process.cwd(), "public"),
      file = path.resolve(root, "." + new URL(url, "http://local").pathname);
    if (!file.startsWith(root + path.sep))
      throw new StoreError("Invalid image path.");
    return readFile(file);
  }
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new StoreError("Invalid image address.");
  }
  if (
    target.protocol !== "https:" ||
    !target.hostname.endsWith(".public.blob.vercel-storage.com") ||
    !target.pathname.startsWith(`/cms-media/${siteId}/`)
  )
    throw new StoreError("Use an image from this website's media library.");
  const response = await fetch(target, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok) throw new StoreError("The image is not available.", 502);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new StoreError("The image is too large.");
  return bytes;
}

const escapeXml = (value: string) =>
  value.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fontName = (variable: string) =>
  variable
    .replace(/^--font-/, "")
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
    .replace(/^Pt /, "PT ");

// Brand caption bar: site's primary colour, light text, heading font when installed
// on the server (otherwise a system sans-serif).
function brandBar(project: Project, title: string, width: number, height: number) {
  const bar = Math.round(Math.max(96, height * 0.11));
  const pair = FONT_PAIRS.find((p) => p.id === project.fonts) ?? FONT_PAIRS[0];
  const size = Math.round(bar * 0.3);
  const max = Math.floor((width * 0.78) / (size * 0.56));
  const label = title.length > max ? title.slice(0, max - 1) + "…" : title;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${bar}">
<rect width="100%" height="100%" fill="${escapeXml(project.brand.primary || "#111111")}"/>
<text x="${Math.round(bar * 0.45)}" y="${Math.round(bar / 2 + size * 0.36)}" font-family="${escapeXml(fontName(pair.heading))}, Arial, sans-serif" font-weight="700" font-size="${size}" fill="${escapeXml(project.brand.secondary || "#ffffff")}">${escapeXml(label)}</text>
<text x="${width - Math.round(bar * 0.45)}" y="${Math.round(bar / 2 + size * 0.3)}" text-anchor="end" font-family="${escapeXml(fontName(pair.body))}, Arial, sans-serif" font-size="${Math.round(size * 0.72)}" fill="${escapeXml(project.brand.alternative || project.brand.secondary || "#ffffff")}">${escapeXml(project.brand.name)}</text>
</svg>`;
  return { input: Buffer.from(svg), top: height - bar, left: 0 };
}

// Cover crop around the focal point (0..1), then the optional brand bar.
export async function renderFormat(
  source: Buffer,
  format: (typeof FORMATS)[number],
  focal: { x: number; y: number },
  bar?: { project: Project; title: string },
  fit: "cover" | "contain" = "cover",
) {
  const { data, info } = await sharp(source, { limitInputPixels: 40000000 })
    .rotate()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = format;
  if (fit === "contain") {
    // Whole picture, centred above the optional bar, on the colour of its top-left
    // pixel (a product shot's own background).
    const { data: px } = await sharp(data)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const background = { r: px[0], g: px[1], b: px[2] };
    const barHeight = bar ? Math.round(Math.max(96, H * 0.11)) : 0;
    const boxW = Math.round(W * 0.86),
      boxH = Math.round((H - barHeight) * 0.86);
    const fitted = await sharp(data)
      .resize(boxW, boxH, { fit: "inside", withoutEnlargement: false })
      .flatten({ background })
      .toBuffer({ resolveWithObject: true });
    const layers: OverlayOptions[] = [
      {
        input: fitted.data,
        left: Math.round((W - fitted.info.width) / 2),
        top: Math.round((H - barHeight - fitted.info.height) / 2),
      },
    ];
    if (bar) layers.push(brandBar(bar.project, bar.title, W, H));
    return sharp({ create: { width: W, height: H, channels: 3, background } })
      .composite(layers)
      .webp({ quality: 88 })
      .toBuffer();
  }
  const scale = Math.max(W / info.width, H / info.height);
  const sw = Math.max(W, Math.round(info.width * scale)),
    sh = Math.max(H, Math.round(info.height * scale));
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const left = clamp(Math.round(focal.x * sw - W / 2), sw - W),
    top = clamp(Math.round(focal.y * sh - H / 2), sh - H);
  let image = sharp(
    await sharp(data).resize(sw, sh).extract({ left, top, width: W, height: H }).toBuffer(),
  );
  if (bar) image = image.composite([brandBar(bar.project, bar.title, W, H)]);
  return image.webp({ quality: 88 }).toBuffer();
}

async function storeBytes(siteId: string, id: string, data: Buffer) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`cms-media/${siteId}/${id}.webp`, data, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
    });
    return blob.url;
  }
  if (process.env.VERCEL)
    throw new StoreError("Connect BLOB_READ_WRITE_TOKEN to store images.", 503);
  const directory = path.join(siteDirectory(siteId), "media");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, `${id}.webp`), data, { mode: 0o600 });
  return localMediaUrl(siteId, id);
}
async function removeBytes(siteId: string, asset: Pick<Media, "id" | "url">) {
  if (/^https:\/\//.test(asset.url)) await del(asset.url).catch(() => {});
  else
    await unlink(path.join(siteDirectory(siteId), "media", `${asset.id}.webp`)).catch(
      () => {},
    );
}

// Adds/removes media library entries; retries once when the project changed meanwhile.
async function updateMedia(
  siteId: string,
  change: (media: Media[]) => Media[],
) {
  for (let attempt = 0; ; attempt++) {
    const project = await readProject(siteId);
    try {
      return await writeProject(
        { ...project, media: change(project.media) },
        undefined,
        "super-admin",
        { siteId },
      );
    } catch (error) {
      if (attempt > 1 || !(error instanceof StoreError) || error.status !== 409)
        throw error;
    }
  }
}

export const renderName = (post: Pick<SocialPost, "id">, format: string, n: number) =>
  `social-${post.id.slice(0, 8)}-${format}-${n + 1}.webp`;

// Renders every selected image (up to 4) in the chosen formats and stores them in the
// website's media library, replacing this post's previous renders.
export async function renderPost(
  siteId: string,
  post: SocialPost,
  formats: FormatId[] = FORMATS.map((f) => f.id),
): Promise<PostRender[]> {
  const images = post.images.slice(0, 4);
  if (!images.length) throw new StoreError("Select at least one image.");
  const project = await readProject(siteId);
  const title =
    (post.fields[post.sourceLocale] ?? Object.values(post.fields)[0])?.title ||
    post.name;
  const created: { render: PostRender; asset: Media }[] = [];
  try {
    for (const [n, url] of images.entries()) {
      const source = await mediaBytes(siteId, url);
      for (const format of FORMATS.filter((f) => formats.includes(f.id))) {
        const data = await renderFormat(
          source,
          format,
          n === 0 ? post.focal : { x: 0.5, y: 0.5 },
          post.brandBar ? { project, title } : undefined,
          post.fit ?? "cover",
        );
        const id = randomUUID();
        const stored = await storeBytes(siteId, id, data);
        const name = renderName(post, format.id, n);
        created.push({
          render: {
            format: format.id,
            image: url,
            mediaId: id,
            url: stored,
            width: format.width,
            height: format.height,
          },
          asset: {
            id,
            name,
            url: stored,
            width: format.width,
            height: format.height,
            size: data.length,
            mime: "image/webp",
            alt: `${title} (${format.label})`,
          },
        });
      }
    }
    const old = new Set(post.renders.map((r) => r.mediaId));
    await updateMedia(siteId, (media) => [
      ...created.map((c) => c.asset),
      ...media.filter((m) => !old.has(m.id)),
    ]);
  } catch (error) {
    await Promise.all(created.map((c) => removeBytes(siteId, c.asset)));
    if (error instanceof StoreError) throw error;
    throw new StoreError("Could not render this image.", 422);
  }
  await Promise.all(
    post.renders.map((r) => removeBytes(siteId, { id: r.mediaId, url: r.url })),
  );
  return created.map((c) => c.render);
}

// Removes a deleted post's renders from the media library.
export async function removeRenders(siteId: string, renders: PostRender[]) {
  if (!renders.length) return;
  const ids = new Set(renders.map((r) => r.mediaId));
  await updateMedia(siteId, (media) => media.filter((m) => !ids.has(m.id)));
  await Promise.all(
    renders.map((r) => removeBytes(siteId, { id: r.mediaId, url: r.url })),
  );
}

// JPEG copy of a social render for networks that need JPEG (Instagram).
export async function renderJpeg(siteId: string, mediaId: string) {
  const project = await readProject(siteId);
  const asset = project.media.find(
    (m) => m.id === mediaId && m.name.startsWith("social-"),
  );
  if (!asset) return null;
  const bytes = await mediaBytes(siteId, asset.url);
  return sharp(bytes).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
}
