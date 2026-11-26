import { z } from "zod";
import { errorResponse, readJson, readProject, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { aiStatus } from "@/lib/builder/ai";
import { siteLanguages } from "@/lib/builder/i18n";
import { connectionStatus } from "@/lib/builder/social/accounts";
import { sourceOptions } from "@/lib/builder/social/sources";
import { publishNetwork } from "@/lib/builder/social/publish";
import { removeRenders } from "@/lib/builder/social/render";
import {
  createPost,
  listPosts,
  newPostInput,
  postAction,
  postCommand,
  postUpdate,
  updatePost,
} from "@/lib/builder/social/store";
import { suggestHashtags, type PostFields } from "@/lib/builder/social/shared";

export const runtime = "nodejs";
// Social posts of the selected website (?site=). Every account with access to the
// website (owner, designer, client) may create, edit and mark posts; publishing through
// a network needs an account the owner connected (Settings → Social accounts).

function baseUrl(request: Request, websiteUrl?: string) {
  const configured = (websiteUrl || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (/^https?:\/\//.test(configured)) return configured;
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
      new URL(request.url).protocol.replace(":", "");
    return `${proto === "https" ? "https" : "http"}://${forwarded.split(",")[0].trim()}`;
  }
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const project = await readProject(site.id);
    const [posts, connections, ai] = await Promise.all([
      listPosts(site.id),
      connectionStatus(site.id),
      aiStatus(),
    ]);
    const languages = siteLanguages(project);
    return Response.json(
      {
        posts,
        sources: sourceOptions(project, site.key, baseUrl(request, project.website?.url)),
        connections,
        languages: languages?.enabled ?? [project.pages[0]?.locale || "en"],
        defaultLanguage: languages?.default ?? project.pages[0]?.locale ?? "en",
        brand: project.brand.name,
        ai: { enabled: ai.enabled, model: ai.model, spent: ai.spent, cap: ai.cap },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

const createInput = z
  .object({
    sourceKey: z.string().max(400).optional(),
    locale: z.enum(["lv", "ru", "en", "de"]).optional(),
    name: z.string().max(200).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const { identity, site } = await authorizeSite(request);
    const parsed = createInput.safeParse(await readJson(request, 4000));
    if (!parsed.success) throw new StoreError("Invalid post.");
    const project = await readProject(site.id);
    const fallbackLocale =
      parsed.data.locale || siteLanguages(project)?.default || project.pages[0]?.locale || "en";
    let input: z.infer<typeof newPostInput>;
    if (parsed.data.sourceKey) {
      // The server reads the content itself; the browser only names the source.
      const option = sourceOptions(project, site.key, baseUrl(request, project.website?.url)).find(
        (o) => o.key === parsed.data.sourceKey,
      );
      if (!option) throw new StoreError("This page or card no longer exists.", 404);
      input = {
        name: parsed.data.name,
        source: option.source,
        sourceLocale: option.locale as "lv",
        languages: [option.locale as "lv"],
        fields: { ...option.translations, [option.locale]: option.fields } as Record<"lv", PostFields>,
        // The card/page image is the cover; more can be added in the editor.
        images: [option.image],
      };
    } else {
      input = {
        name: parsed.data.name || "New post",
        source: { kind: "free", label: "Free post" },
        sourceLocale: fallbackLocale as "lv",
        fields: {
          [fallbackLocale]: { title: "", description: "", price: "", link: "" },
        } as Record<"lv", PostFields>,
        images: [],
      };
    }
    const checked = newPostInput.safeParse(input);
    if (!checked.success)
      throw new StoreError(checked.error.issues[0]?.message || "Invalid post.");
    const title = checked.data.fields[checked.data.sourceLocale]?.title || "";
    return Response.json(
      await createPost(identity, site.id, checked.data, suggestHashtags(project.brand.name, title)),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { identity, site } = await authorizeSite(request);
    const body = await readJson(request, 200000);
    if (body && typeof body === "object" && "action" in body) {
      const parsed = postAction.safeParse(body);
      if (!parsed.success)
        throw new StoreError(parsed.error.issues[0]?.message || "Invalid action.");
      if (parsed.data.action === "publish")
        return Response.json(
          await publishNetwork(
            site.id,
            parsed.data.id,
            parsed.data.network,
            identity.name || identity.email || "Owner",
          ),
        );
      const result = await postCommand(identity, site.id, parsed.data);
      if ("deleted" in result) await removeRenders(site.id, result.renders);
      return Response.json(result);
    }
    const parsed = postUpdate.safeParse(body);
    if (!parsed.success)
      throw new StoreError(parsed.error.issues[0]?.message || "Invalid post.");
    return Response.json(await updatePost(identity, site.id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
