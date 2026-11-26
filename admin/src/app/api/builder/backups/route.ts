import { z } from "zod";
import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import {
  listBackups,
  createBackup,
  verifyBackup,
  restoreBackup,
  removeBackup,
  downloadBackup,
} from "@/lib/builder/backups";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request, true);
    const url = new URL(request.url);
    if (url.searchParams.get("download"))
      return await downloadBackup(site.id, url.searchParams.get("download")!);
    return Response.json(await listBackups(site.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const { site } = await authorizeSite(request, true);
    const parsed = z
      .object({
        action: z.enum(["create", "verify", "restore"]),
        id: z.string().max(100).optional(),
        revision: z.number().int().nonnegative().optional(),
        confirm: z.literal("RESTORE").optional(),
      })
      .strict()
      .safeParse(await readJson(request, 4000));
    if (!parsed.success) throw new StoreError("Invalid backup operation.");
    const value = parsed.data;
    if (value.action === "create")
      return Response.json(await createBackup(site.id), { status: 201 });
    if (!value.id) throw new StoreError("Select a backup.");
    if (value.action === "verify")
      return Response.json(await verifyBackup(site.id, value.id));
    if (value.confirm !== "RESTORE" || value.revision === undefined)
      throw new StoreError(
        "Confirm restoration and reload the current project.",
      );
    return Response.json(
      await restoreBackup(site.id, value.id, value.revision),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const { site } = await authorizeSite(request, true);
    await removeBackup(
      site.id,
      new URL(request.url).searchParams.get("id") || "",
    );
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
