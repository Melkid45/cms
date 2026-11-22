import { z } from "zod";
import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import {
  authorizeSite,
  companyInput,
  companyPin,
  companyRename,
  createCompany,
  createSite,
  pinCompany,
  readRegistry,
  renameCompany,
  siteInput,
  workspace,
} from "@/lib/builder/sites";
export const runtime = "nodejs";
// Companies and websites visible to the signed-in account, plus the selected website.
export async function GET(request: Request) {
  try {
    const { identity, site } = await authorizeSite(request);
    return Response.json(
      { current: site, ...workspace(await readRegistry(), identity) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
const action = z.discriminatedUnion("action", [
  companyInput.extend({ action: z.literal("company") }),
  siteInput.extend({ action: z.literal("site") }),
  companyRename.extend({ action: z.literal("rename-company") }),
  companyPin.extend({ action: z.literal("pin-company") }),
]);
export async function POST(request: Request) {
  try {
    await authorizeSite(request, true);
    const parsed = action.safeParse(await readJson(request, 4000));
    if (!parsed.success)
      throw new StoreError(
        "Enter a name. Website addresses use lowercase letters, numbers and hyphens.",
      );
    const { action: kind, ...value } = parsed.data;
    if (kind === "pin-company")
      return Response.json(await pinCompany(value as z.infer<typeof companyPin>));
    if (kind === "rename-company")
      return Response.json(
        await renameCompany(value as z.infer<typeof companyRename>),
      );
    const created =
      kind === "company"
        ? await createCompany(value as z.infer<typeof companyInput>)
        : await createSite(value as z.infer<typeof siteInput>);
    return Response.json(created, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
