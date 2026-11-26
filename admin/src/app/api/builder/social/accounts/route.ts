import { z } from "zod";
import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import {
  accountsOverview,
  chooseMetaPage,
  disconnect,
} from "@/lib/builder/social/accounts";

export const runtime = "nodejs";
// Connected social accounts of the selected website: super admin only.

export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request, true);
    return Response.json(await accountsOverview(site.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const choice = z
  .object({ pageId: z.string().regex(/^\d{1,40}$/), instagram: z.boolean() })
  .strict();

export async function PATCH(request: Request) {
  try {
    const { site } = await authorizeSite(request, true);
    const parsed = choice.safeParse(await readJson(request, 1000));
    if (!parsed.success) throw new StoreError("Choose a Facebook Page.");
    await chooseMetaPage(site.id, parsed.data.pageId, parsed.data.instagram);
    return Response.json(await accountsOverview(site.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { site } = await authorizeSite(request, true);
    const provider = new URL(request.url).searchParams.get("provider");
    if (provider !== "meta" && provider !== "tiktok")
      throw new StoreError("Unknown network.");
    await disconnect(site.id, provider);
    return Response.json(await accountsOverview(site.id));
  } catch (error) {
    return errorResponse(error);
  }
}
