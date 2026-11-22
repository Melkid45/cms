import { errorResponse, StoreError } from "@/lib/builder/server";
import { readSiteProject } from "@/lib/builder/products/public";
import { readRegistry, primarySite } from "@/lib/builder/sites";
import { formToken } from "@/lib/builder/submissions";
import { connectedContent } from "@/lib/builder/inline-content";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pageId = url.searchParams.get("pageId") || "";
    const registry = await readRegistry();
    const site = url.searchParams.get("site")
      ? registry.sites.find((s) => s.id === url.searchParams.get("site"))
      : primarySite(registry);
    if (!site) throw new StoreError("Form unavailable.", 404);
    // Product pages built from the catalogue count as published pages; so do published
    // standalone service pages (pageId "service:{id}").
    const project = connectedContent(
      await readSiteProject(site.id, site.key),
      [],
      true,
    ).project;
    if (
      !project.forms?.enabled ||
      (!project.pages.some(
        (p) => p.id === pageId && p.published && !p.deletedAt,
      ) &&
        !project.services?.some(
          (s) => pageId === `service:${s.id}` && s.status === "Published",
        ))
    )
      throw new StoreError("Form unavailable.", 404);
    return Response.json(
      { token: formToken(pageId, site.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
