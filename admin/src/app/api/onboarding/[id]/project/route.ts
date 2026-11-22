import { errorResponse, readProject } from "@/lib/builder/server";
import { authorizeOnboarding } from "@/lib/builder/onboarding/store";

export const runtime = "nodejs";
// Draft website for the review screen (rendered client-side by /canvas). Only the pages of
// this onboarding; no history or published snapshots.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { record } = await authorizeOnboarding(request, id);
    const project = await readProject(record.siteId);
    const own = new Set(record.pages.map((p) => p.pageId));
    return Response.json(
      {
        ...project,
        pages: project.pages
          .filter((p) => own.has(p.id) && !p.deletedAt)
          .map((page) => {
            const { history, published, ...rest } = page;
            void history;
            void published;
            return rest;
          }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
