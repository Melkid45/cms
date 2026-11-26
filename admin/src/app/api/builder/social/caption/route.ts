import { errorResponse, readJson, readProject, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { aiComplete, aiEnabled } from "@/lib/builder/ai";
import { LOCALE_NAMES } from "@/lib/builder/i18n";
import { aiInput, findPost, postStore } from "@/lib/builder/social/store";
import {
  CAPTION_LIMITS,
  HASHTAG_LIMIT,
  NETWORK_NAMES,
  trackedLink,
} from "@/lib/builder/social/shared";

export const runtime = "nodejs";

// "Generate with AI": paid OpenRouter call through lib/builder/ai.ts. Off unless the
// owner sets CMS_AI=1 and OPENROUTER_API_KEY; the answer is not saved automatically.
export async function POST(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    if (!aiEnabled())
      throw new StoreError("AI is switched off. Use the template caption.", 503);
    const parsed = aiInput.safeParse(await readJson(request, 2000));
    if (!parsed.success) throw new StoreError("Invalid request.");
    const { id, network } = parsed.data;
    const post = await postStore(site.id, (data) => findPost(data, id), false);
    const project = await readProject(site.id);
    const content = post.languages.map((locale) => {
      const f = post.fields[locale] ?? post.fields[post.sourceLocale];
      return `Language: ${LOCALE_NAMES[locale] || locale}\nTitle: ${f?.title}\nDescription: ${f?.description}\nPrice: ${f?.price || "-"}\nLink: ${network === "facebook" ? trackedLink(f?.link || "", network) : "(not clickable here — say the link is in the bio)"}`;
    });
    const result = await aiComplete({
      system: `You write social media captions for the small business "${project.brand.name}". Write one ${NETWORK_NAMES[network]} caption, at most ${Math.min(CAPTION_LIMITS[network], 2200)} characters, with a short hook, the key facts, the price if given, a call to action and at most ${HASHTAG_LIMIT} relevant hashtags at the end (include: ${post.hashtags || "none"}). Write a separate block for each language listed, in that language, in the given order. Plain text only, no markdown. Never invent facts, prices or discounts.`,
      user: content.join("\n\n"),
      maxTokens: 900,
    });
    return Response.json({
      caption: result.text.slice(0, CAPTION_LIMITS[network]),
      cost: result.cost,
      model: result.model,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
