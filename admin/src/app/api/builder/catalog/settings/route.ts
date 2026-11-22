import { errorResponse, readJson, readProject, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { saveSettings, settingsInput } from "@/lib/builder/products/store";
export const runtime = "nodejs";

// Catalogue settings (template pages, filters, price format): design roles only.
export async function PUT(request: Request) {
  try {
    const { site } = await authorizeSite(request, "design");
    const parsed = settingsInput.safeParse(await readJson(request, 20_000));
    if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message || "Check the settings.");
    return Response.json(await saveSettings(site.id, parsed.data, await readProject(site.id)));
  } catch (error) {
    return errorResponse(error);
  }
}
