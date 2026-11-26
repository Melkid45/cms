import { z } from "zod";
import {
  errorResponse,
  readJson,
  readProject,
  StoreError,
} from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import {
  saveSettings,
  saveCategories,
  settingsInput,
} from "@/lib/builder/products/store";
export const runtime = "nodejs";

// Catalogue settings (template pages, filters, price format): design roles only.
export async function PUT(request: Request) {
  try {
    const { site } = await authorizeSite(request, "design");
    const parsed = settingsInput.safeParse(await readJson(request, 20_000));
    if (!parsed.success)
      throw new StoreError(
        parsed.error.issues[0]?.message || "Check the settings.",
      );
    return Response.json(
      await saveSettings(site.id, parsed.data, await readProject(site.id)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

// Shop clients may maintain category names; design settings stay protected by PUT.
export async function PATCH(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const parsed = z
      .object({
        categories: z.array(z.string().trim().min(1).max(100)).max(100),
        revision: z.number().int().nonnegative(),
      })
      .strict()
      .safeParse(await readJson(request, 20_000));
    if (!parsed.success)
      throw new StoreError(
        "Choose valid category names and reload the catalogue if it has changed.",
      );
    return Response.json(
      await saveCategories(
        site.id,
        parsed.data.categories,
        parsed.data.revision,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
