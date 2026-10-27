import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { safeSvg } from "@/lib/builder/svg";
import { put, del } from "@vercel/blob";
import {
  readProject,
  writeProject,
  authorizeWrite,
  errorResponse,
  dataDirectory,
  StoreError,
} from "@/lib/builder/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let cleanup: (() => Promise<unknown>) | undefined;
  try {
    authorizeWrite(request);
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
      const blob = await put(`cms-media/${id}.webp`, data, {
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
      await mkdir(path.join(dataDirectory, "media"), {
        recursive: true,
        mode: 0o700,
      });
      const dest = path.join(dataDirectory, "media", `${id}.webp`);
      await writeFile(dest, data, { mode: 0o600 });
      url = `/api/builder/media/${id}`;
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
