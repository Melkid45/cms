import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory } from "@/lib/builder/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
  try {
    return new Response(
      await readFile(path.join(dataDirectory, "media", `${id}.webp`)),
      {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public,max-age=31536000,immutable",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return new Response(null, { status: 404 });
  }
}
