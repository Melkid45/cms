import { connectedContent } from "@/lib/builder/inline-content";
import { readProject, errorResponse, StoreError } from "@/lib/builder/server";
import { formToken } from "@/lib/builder/submissions";
export async function GET(request: Request) {
  try {
    const pageId = new URL(request.url).searchParams.get("pageId") || "";
    const project = connectedContent(await readProject(), [], true).project;
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
      { token: formToken(pageId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
