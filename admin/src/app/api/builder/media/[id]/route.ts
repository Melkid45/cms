import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory, readProject } from "@/lib/builder/server";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const project = await readProject();
    const mime =
      project.media.find((asset) => asset.url === `/api/builder/media/${id}`)
        ?.mime || "image/webp";
    return new Response(
      await readFile(
        path.join(
          dataDirectory,
          "media",
          `${id}${new URL(request.url).searchParams.get("thumbnail") === "1" ? "-thumb" : ""}.webp`,
        ),
      ),
      {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public,max-age=31536000,immutable",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return new Response(null, { status: 404 });
  }
}
