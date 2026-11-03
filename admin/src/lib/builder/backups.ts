import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { put, del } from "@vercel/blob";
import {
  database,
  dataDirectory,
  readProject,
  writeProject,
  StoreError,
} from "./server";
import { safeSvg } from "./svg";
import type { Project, Media } from "./types";
import { definition } from "./catalog";
type Asset = {
  url: string;
  mime: string;
  width: number;
  height: number;
  sha256: string;
  data: string;
};
type Archive = {
  id: string;
  format: "harbstone-backup";
  version: 1;
  createdAt: string;
  kind: "Full" | "Before restore";
  project: Project;
  assets: Asset[];
  checksum: string;
};
const directory = path.join(dataDirectory, "backups");
const maxBytes = 32 * 1024 * 1024;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  return value;
}
const hash = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
function digest(archive: Omit<Archive, "checksum">) {
  return hash(JSON.stringify(canonical(archive)));
}
function urls(project: Project) {
  const found = new Set<string>();
  function walk(value: unknown) {
    if (
      typeof value === "string" &&
      (/^\/(images|brand)\//.test(value) ||
        /^\/api\/builder\/media\/[a-f0-9-]{36}$/.test(value) ||
        /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\/cms-media\//.test(
          value,
        ))
    )
      found.add(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object")
      Object.values(value).forEach(walk);
  }
  walk(project);
  return [...found];
}
async function bytesAt(url: string): Promise<Buffer> {
  if (url.startsWith("/api/builder/media/")) {
    const id = url.split("/").at(-1)!;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Invalid media");
    return readFile(path.join(dataDirectory, "media", id + ".webp"));
  }
  if (/^\/(images|brand)\//.test(url)) {
    const root = path.join(process.cwd(), "public"),
      file = path.resolve(root, "." + new URL(url, "http://local").pathname);
    if (!file.startsWith(root + path.sep)) throw Error("Invalid media path");
    return readFile(file);
  }
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    !target.hostname.endsWith(".public.blob.vercel-storage.com") ||
    !target.pathname.startsWith("/cms-media/")
  )
    throw Error("Unsupported media location");
  const response = await fetch(target, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length") || 0) > 12 * 1024 * 1024
  )
    throw Error("Media unavailable");
  const reader = response.body!.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 12 * 1024 * 1024) {
      await reader.cancel();
      throw Error("Media too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function store(archive: Archive) {
  const sql = await database();
  if (sql) {
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(731920042)`;
      if (archive.kind === "Full") {
        const [row] =
          await tx`SELECT count(*)::int AS count FROM harbstone_project WHERE id LIKE 'backup:%' AND document->>'kind'='Full'`;
        if (row.count >= 5)
          throw new StoreError(
            "Five full backups are already stored. Download and remove an older copy first.",
          );
      }
      await tx`INSERT INTO harbstone_project(id,document) VALUES (${"backup:" + archive.id},${tx.json(archive as never)}) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document`;
    });
    return;
  }
  if (process.env.VERCEL)
    throw new StoreError("Backup storage is not configured.", 503);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, archive.id + ".json");
  await writeFile(file + ".tmp", JSON.stringify(archive), { mode: 0o600 });
  await rename(file + ".tmp", file);
}
function metadata(archive: Archive) {
  return {
    id: archive.id,
    createdAt: archive.createdAt,
    kind: archive.kind,
    pages: archive.project.pages.length,
    media: archive.assets.length,
    bytes: archive.assets.reduce(
      (sum, asset) => sum + Buffer.byteLength(asset.data, "base64"),
      0,
    ),
    checksum: archive.checksum,
  };
}
export async function listBackups() {
  const sql = await database();
  if (sql) {
    const rows =
      await sql`SELECT document->>'id' AS id,document->>'createdAt' AS "createdAt",document->>'kind' AS kind,jsonb_array_length(document->'project'->'pages') AS pages,jsonb_array_length(document->'assets') AS media FROM harbstone_project WHERE id LIKE 'backup:%' ORDER BY document->>'createdAt' DESC`;
    return rows;
  }
  try {
    const files = await readdir(directory);
    return (
      await Promise.all(
        files
          .filter((file) => /^(safety|[a-f0-9-]{36})\.json$/.test(file))
          .map(async (file) =>
            metadata(
              JSON.parse(await readFile(path.join(directory, file), "utf8")),
            ),
          ),
      )
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return [];
  }
}
export async function readBackup(id: string): Promise<Archive> {
  if (id !== "safety" && !/^[a-f0-9-]{36}$/.test(id))
    throw new StoreError("Invalid backup.", 400);
  const sql = await database();
  if (sql) {
    const [row] =
      await sql`SELECT document FROM harbstone_project WHERE id=${"backup:" + id}`;
    if (!row) throw new StoreError("Backup not found.", 404);
    return row.document;
  }
  try {
    return JSON.parse(
      await readFile(path.join(directory, id + ".json"), "utf8"),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new StoreError("Backup not found.", 404);
    throw e;
  }
}
export function verifyArchive(archive: Archive) {
  const { checksum, ...payload } = archive;
  if (
    archive.format !== "harbstone-backup" ||
    archive.version !== 1 ||
    digest(payload) !== checksum
  )
    throw new StoreError(
      "The backup checksum does not match. Nothing was restored.",
    );
  for (const asset of archive.assets) {
    if (hash(Buffer.from(asset.data, "base64")) !== asset.sha256)
      throw new StoreError(
        "A media file failed verification. Nothing was restored.",
      );
  }
  if (
    archive.kind === "Full" &&
    urls(archive.project).some(
      (url) => !archive.assets.some((asset) => asset.url === url),
    )
  )
    throw new StoreError("The backup is missing a media file.");
  return {
    ok: true,
    pages: archive.project.pages.length,
    media: archive.assets.length,
    message: "Backup verified. Content and media checksums match.",
  };
}
export async function createBackup() {
  const backups = await listBackups();
  if (backups.filter((backup) => backup.kind === "Full").length >= 5)
    throw new StoreError(
      "Five full backups are already stored. Download and remove an older copy first.",
    );
  const project = await readProject(),
    assets: Asset[] = [];
  const mediaUrls = urls(project);
  const blocks = [
    project.layout.header,
    project.layout.footer,
    ...project.pages.flatMap((page) => [
      ...page.sections,
      ...(page.published?.sections || []),
      ...(page.history || []).flatMap((version) => version.sections),
    ]),
  ];
  const imageValues = blocks.flatMap((block) => {
    const fields =
      definition(block.variant)?.fields.filter(
        (field) => field.type === "image",
      ) || [];
    return fields.flatMap((field) => [
      block.values[field.key] ?? field.value,
      ...Object.values(block.collections || {}).flatMap((items) =>
        items.map((item) => item.values[field.key]).filter(Boolean),
      ),
    ]);
  });
  if (
    [...project.media.map((asset) => asset.url), ...imageValues].some(
      (url) => url && !mediaUrls.includes(url),
    )
  )
    throw new StoreError(
      "Upload externally hosted images into Media library before creating a full backup. No partial copy was saved.",
    );
  let total = 0;
  for (const url of urls(project)) {
    try {
      let data = await bytesAt(url);
      if (/\.svg(?:\?|$)/i.test(url)) data = safeSvg(data.toString("utf8"));
      total += data.length;
      if (total > maxBytes)
        throw new StoreError(
          "Media exceeds the 32 MB limit for this backup version. No partial backup was saved.",
          413,
        );
      const info = await sharp(data, { limitInputPixels: 40000000 }).metadata();
      const mime =
        info.format === "jpeg" ? "image/jpeg" : `image/${info.format}`;
      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/avif",
          "image/gif",
          "image/svg",
        ].includes(mime)
      )
        throw Error("Unsupported image");
      assets.push({
        url,
        mime: mime === "image/svg" ? "image/svg+xml" : mime,
        width: info.width || 0,
        height: info.height || 0,
        sha256: hash(data),
        data: data.toString("base64"),
      });
    } catch (e) {
      if (e instanceof StoreError) throw e;
      throw new StoreError(
        `Could not copy a media file: ${url.slice(0, 160)}. No partial backup was saved.`,
      );
    }
  }
  const payload = {
    id: randomUUID(),
    format: "harbstone-backup" as const,
    version: 1 as const,
    createdAt: new Date().toISOString(),
    kind: "Full" as const,
    project,
    assets,
  };
  const archive = { ...payload, checksum: digest(payload) };
  verifyArchive(archive);
  await store(archive);
  return metadata(archive);
}
export async function verifyBackup(id: string) {
  return verifyArchive(await readBackup(id));
}
function replaceUrls<T>(value: T, map: Map<string, string>): T {
  if (typeof value === "string") return (map.get(value) || value) as T;
  if (Array.isArray(value))
    return value.map((item) => replaceUrls(item, map)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceUrls(item, map)]),
    ) as T;
  return value;
}
export async function restoreBackup(id: string, revision: number) {
  const archive = await readBackup(id);
  verifyArchive(archive);
  const current = await readProject();
  if (current.revision !== revision)
    throw new StoreError("The project changed. Refresh before restoring.", 409);
  const map = new Map<string, string>(),
    created: { url: string; file?: string }[] = [],
    extra: Media[] = [];
  try {
    for (const asset of archive.assets) {
      const data = Buffer.from(asset.data, "base64"),
        mediaId = randomUUID();
      let url: string;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blob = await put(
          `cms-media/${mediaId}.${asset.mime.split("/")[1].replace("svg+xml", "svg")}`,
          data,
          { access: "public", contentType: asset.mime, addRandomSuffix: false },
        );
        url = blob.url;
        created.push({ url });
      } else {
        if (process.env.VERCEL)
          throw new StoreError("Connect media storage before restoring.", 503);
        await mkdir(path.join(dataDirectory, "media"), {
          recursive: true,
          mode: 0o700,
        });
        const file = path.join(dataDirectory, "media", mediaId + ".webp");
        await writeFile(file, data, { mode: 0o600 });
        url = `/api/builder/media/${mediaId}`;
        created.push({ url, file });
      }
      map.set(asset.url, url);
      if (hash(await bytesAt(url)) !== asset.sha256)
        throw new StoreError(
          "A restored media file did not pass verification. Nothing was restored.",
        );
      if (!archive.project.media.some((media) => media.url === asset.url))
        extra.push({
          id: mediaId,
          url,
          name: asset.url.split("/").at(-1) || "Restored image",
          mime: asset.mime,
          width: asset.width,
          height: asset.height,
          size: data.length,
          alt: "",
        });
    }
    // Original assets are never deleted. This content checkpoint protects the state before restore.
    const safety = {
      id: "safety",
      format: "harbstone-backup" as const,
      version: 1 as const,
      createdAt: new Date().toISOString(),
      kind: "Before restore" as const,
      project: current,
      assets: [] as Asset[],
    };
    await store({ ...safety, checksum: digest(safety) });
    const next = replaceUrls(archive.project, map);
    next.revision = revision;
    next.media = archive.project.media.map((media) => {
      const asset = archive.assets.find((asset) => asset.url === media.url);
      return asset
        ? {
            ...media,
            url: map.get(media.url)!,
            mime: asset.mime,
            width: asset.width,
            height: asset.height,
            size: Buffer.byteLength(asset.data, "base64"),
          }
        : media;
    });
    next.media.push(...extra);
    return await writeProject(next, undefined, "super-admin", {
      restore: true,
    });
  } catch (e) {
    await Promise.allSettled(
      created.map((asset) =>
        asset.file ? unlink(asset.file) : del(asset.url),
      ),
    );
    throw e;
  }
}
export async function removeBackup(id: string) {
  await readBackup(id);
  const sql = await database();
  if (sql) await sql`DELETE FROM harbstone_project WHERE id=${"backup:" + id}`;
  else await unlink(path.join(directory, id + ".json"));
}
export async function downloadBackup(id: string) {
  const archive = await readBackup(id);
  verifyArchive(archive);
  const bytes = new TextEncoder().encode(JSON.stringify(archive));
  let position = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (position >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.subarray(position, position + 16000));
        position += 16000;
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="harbstone-${archive.createdAt.slice(0, 10)}-${id}.json"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
