import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { optimizeImage } from "./image-processing";
import { safeSvg } from "@/lib/builder/svg";
import { put, del } from "@vercel/blob";
import {
  readProject,
  writeProject,
  errorResponse,
  dataDirectory,
  StoreError,
} from "@/lib/builder/server";
export async function storeMedia(request: Request) {
  let cleanup: (() => Promise<unknown>) | undefined;
  try {
    if (Number(request.headers.get("content-length")) > 12 * 1024 * 1024)
      throw new StoreError("Choose an image under 10 MB.");
    const form = await request.formData(),
      file = form.get("file");
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
    let optimized;
    try {
      optimized = await optimizeImage(bytes);
    } catch (error) {
      throw new StoreError(
        error instanceof Error && error.message.startsWith("Animated")
          ? error.message
          : "This image could not be processed. Choose a valid image under 40 megapixels.",
        400,
      );
    }
    const { data, info } = optimized.main;
    const thumbnail = optimized.thumbnail.data;
    const id = randomUUID();
    let url: string;
    let thumbnailUrl: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`cms-media/${id}.webp`, data, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
      });
      url = blob.url;
      cleanup = () => del(url);
      const preview = await put(`cms-media/${id}-thumb.webp`, thumbnail, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
      });
      thumbnailUrl = preview.url;
      cleanup = () => del([url, thumbnailUrl]);
    } else {
      if (process.env.VERCEL)
        throw new StoreError(
          "Connect BLOB_READ_WRITE_TOKEN to enable uploads on Vercel.",
          503,
        );
      await mkdir(path.join(dataDirectory, "media"), {
        recursive: true,
        mode: 0o700,
      });
      const dest = path.join(dataDirectory, "media", `${id}.webp`);
      await writeFile(dest, data, { mode: 0o600 });
      url = `/api/builder/media/${id}`;
      cleanup = () => unlink(dest);
      const thumbDest = path.join(dataDirectory, "media", `${id}-thumb.webp`);
      await writeFile(thumbDest, thumbnail, { mode: 0o600 });
      thumbnailUrl = `/api/builder/media/${id}?thumbnail=1`;
      cleanup = () => Promise.allSettled([unlink(dest), unlink(thumbDest)]);
    }
    const asset = {
      id,
      name: file.name,
      url,
      thumbnailUrl,
      width: info.width,
      height: info.height,
      size: data.length,
      mime: "image/webp",
      alt: file.name.replace(/\.[^.]+$/, "").replaceAll("-", " "),
    };
    const project = await readProject();
    project.media.unshift(asset);
    const saved = await writeProject(project);
    cleanup = undefined;
    return Response.json({ asset, project: saved });
  } catch (e) {
    await cleanup?.().catch(() => {});
    return errorResponse(e);
  }
}
