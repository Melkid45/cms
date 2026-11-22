import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { renderPost } from "@/lib/builder/social/render";
import { addHistory, findPost, postStore, renderInput } from "@/lib/builder/social/store";
import type { FormatId } from "@/lib/builder/social/shared";

export const runtime = "nodejs";
export const maxDuration = 60;

// Renders the post's images in the social formats into the website's media library.
export async function POST(request: Request) {
  try {
    const { identity, site } = await authorizeSite(request);
    const parsed = renderInput.safeParse(await readJson(request, 2000));
    if (!parsed.success) throw new StoreError("Invalid render request.");
    const post = await postStore(site.id, (data) => findPost(data, parsed.data.id), false);
    const renders = await renderPost(site.id, post, parsed.data.formats as FormatId[] | undefined);
    return Response.json(
      await postStore(site.id, (data) => {
        const current = findPost(data, post.id);
        current.renders = renders;
        current.updatedAt = new Date().toISOString();
        addHistory(
          current,
          identity.name || identity.email || "Owner",
          `Rendered ${renders.length} image${renders.length === 1 ? "" : "s"}`,
        );
        return current;
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
