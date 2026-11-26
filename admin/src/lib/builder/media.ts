import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { safeSvg } from "@/lib/builder/svg";
import { put, del } from "@vercel/blob";
import {
  readProject,
  writeProject,
  errorResponse,
  StoreError,
  legacySiteId,
  localMediaUrl,
  siteDirectory,
} from "@/lib/builder/server";
export async function storeMedia(
  request: Request,
  siteId: string = legacySiteId,
) {
  let cleanup: (() => Promise<unknown>) | undefined;
  try {
    // Images up to 10 MB; background videos (MP4/WebM, hero-v52) up to 30 MB.
    if (Number(request.headers.get("content-length")) > 32 * 1024 * 1024)
      throw new StoreError("Choose an image under 10 MB or a video under 30 MB.");
    const form = await request.formData(),
      file = form.get("file");
    if (file instanceof File && VIDEO_TYPES.includes(file.type)) {
      const stored = await storeVideo(file, siteId);
      cleanup = stored.cleanup;
      const project = await readProject(siteId);
      project.media.unshift(stored.asset);
      const saved = await writeProject(project, undefined, "super-admin", {
        siteId,
      });
      cleanup = undefined;
      return Response.json({ asset: stored.asset, project: saved });
    }
    if (
      !(file instanceof File) ||
      file.size > 10 * 1024 * 1024 ||
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/gif",
        "image/svg+xml",
      ].includes(file.type)
    )
      throw new StoreError(
        "Use JPG, PNG, WebP, AVIF, GIF or a plain SVG under 10 MB.",
      );
    let bytes: Buffer = Buffer.from(await file.arrayBuffer());
    if (file.type === "image/svg+xml") {
      try {
        bytes = safeSvg(bytes.toString("utf8"));
      } catch {
        throw new StoreError(
          "Use a plain SVG without scripts or external resources, or export the logo as PNG.",
        );
      }
    }
    // Animated GIF/WebP would silently keep only the first frame: refuse them with a clear message.
    const pages = await sharp(bytes, { limitInputPixels: 40000000 })
      .metadata()
      .then((m) => m.pages || 1)
      .catch(() => 1);
    if (pages > 1)
      throw new StoreError(
        "Animated images are not supported. Choose a still image.",
      );
    const input = sharp(bytes, {
      limitInputPixels: 40000000,
    }).rotate();
    const { data, info } = await input
      .resize({
        width: 4000,
        height: 4000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    const id = randomUUID();
    let url: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`cms-media/${siteId}/${id}.webp`, data, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
      });
      url = blob.url;
      cleanup = () => del(url);
    } else {
      if (process.env.VERCEL)
        throw new StoreError(
          "Connect BLOB_READ_WRITE_TOKEN to enable uploads on Vercel.",
          503,
        );
      await mkdir(path.join(siteDirectory(siteId), "media"), {
        recursive: true,
        mode: 0o700,
      });
      const dest = path.join(siteDirectory(siteId), "media", `${id}.webp`);
      await writeFile(dest, data, { mode: 0o600 });
      url = localMediaUrl(siteId, id);
      cleanup = () => unlink(dest);
    }
    const asset = {
      id,
      name: file.name,
      url,
      width: info.width,
      height: info.height,
      size: data.length,
      mime: "image/webp",
      alt: file.name.replace(/\.[^.]+$/, "").replaceAll("-", " "),
    };
    const project = await readProject(siteId);
    project.media.unshift(asset);
    const saved = await writeProject(project, undefined, "super-admin", {
      siteId,
    });
    cleanup = undefined;
    return Response.json({ asset, project: saved });
  } catch (e) {
    await cleanup?.().catch(() => {});
    return errorResponse(e);
  }
}

// Background videos are stored as uploaded (no re-encoding): checked by size and file signature.
export const VIDEO_TYPES = ["video/mp4", "video/webm"];
export const mediaExtension = (mime?: string) =>
  mime === "video/mp4" ? "mp4" : mime === "video/webm" ? "webm" : "webp";
async function storeVideo(file: File, siteId: string) {
  if (file.size > 30 * 1024 * 1024)
    throw new StoreError("Choose a video under 30 MB (MP4 or WebM).");
  const data = Buffer.from(await file.arrayBuffer());
  const mp4 = data.subarray(4, 8).toString("latin1") === "ftyp";
  const webm = data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if ((file.type === "video/mp4" && !mp4) || (file.type === "video/webm" && !webm))
    throw new StoreError("This file is not a valid MP4 or WebM video.");
  const id = randomUUID(),
    ext = mediaExtension(file.type);
  let url: string, cleanup: () => Promise<unknown>;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`cms-media/${siteId}/${id}.${ext}`, data, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });
    url = blob.url;
    cleanup = () => del(url);
  } else {
    if (process.env.VERCEL)
      throw new StoreError(
        "Connect BLOB_READ_WRITE_TOKEN to enable uploads on Vercel.",
        503,
      );
    await mkdir(path.join(siteDirectory(siteId), "media"), {
      recursive: true,
      mode: 0o700,
    });
    const dest = path.join(siteDirectory(siteId), "media", `${id}.${ext}`);
    await writeFile(dest, data, { mode: 0o600 });
    url = localMediaUrl(siteId, id);
    cleanup = () => unlink(dest);
  }
  return {
    cleanup,
    asset: {
      id,
      name: file.name,
      url,
      width: 0,
      height: 0,
      size: data.length,
      mime: file.type,
      alt: file.name.replace(/\.[^.]+$/, "").replaceAll("-", " "),
    },
  };
}
