import "server-only";
import { aiComplete } from "../../ai";
import type { Identity } from "../../access";
import { readProject, StoreError } from "../../server";
import { connectionStatus } from "../../social/accounts";
import { captionFor, publishNetwork } from "../../social/publish";
import { renderPost } from "../../social/render";
import {
  CAPTION_LIMITS,
  NETWORK_FORMAT,
  NETWORK_NAMES,
  NETWORKS,
  suggestHashtags,
  type FormatId,
  type PostFields,
  type SocialPost,
} from "../../social/shared";
import { sourceOptions } from "../../social/sources";
import { addHistory as addPostHistory, createPost, findPost, newPostInput, postStore } from "../../social/store";
import { registerApprovalProvider } from "../providers";
import { approvalsStore, enqueue } from "../store";

// Social posts: a newly published product/work card or page becomes a draft post (caption
// from the template, picture rendered 4:5) and an approval item. Approve publishes to the
// connected networks (or leaves the post ready to publish by hand), Skip keeps the draft,
// Edit rewrites the caption with AI.

const system: Identity = { id: "approvals", email: "", name: "Approvals", role: "super-admin", version: 0 };
const MAX_NEW_PER_PUBLISH = 3;

const readPost = (siteId: string, postId: string) =>
  postStore(siteId, (data) => structuredClone(findPost(data, postId)), false);

const previewOf = (post: SocialPost) => captionFor(post, "instagram");
const pictureOf = (post: SocialPost) =>
  post.renders.find((r) => r.format === "portrait")?.url || post.images[0] || "";

async function renderAndSave(siteId: string, post: SocialPost, formats: FormatId[]) {
  const renders = await renderPost(siteId, post, formats);
  return postStore(siteId, (data) => {
    const p = findPost(data, post.id);
    p.renders = renders;
    p.updatedAt = new Date().toISOString();
    return structuredClone(p);
  });
}

// Called after a page is published (api/builder PUT ?publish=). Returns new items.
export async function socialOnPublish(siteId: string, siteKey: string, pageId: string, baseUrl: string) {
  const state = await approvalsStore(siteId, (d) => ({ auto: d.settings.autoSocial, baseline: !!d.socialBaseline, seen: d.socialSeen ?? [] }), false);
  if (!state.auto) return 0;
  const project = await readProject(siteId);
  const site = (project.website?.url || "").replace(/\/$/, "");
  const options = sourceOptions(project, siteKey, /^https?:\/\//.test(site) ? site : baseUrl);
  // Two keys per source: its id and its content (language + title + picture), so a page that
  // is rebuilt with new card ids does not count as new products.
  const keysOf = (o: (typeof options)[number]) => [o.key, `c:${o.locale}|${o.fields.title}|${o.image}`.slice(0, 300)];
  const seen = new Set(state.seen);
  // First run: everything that is already published counts as old (no flood of drafts).
  if (!state.baseline) {
    await approvalsStore(siteId, (d) => {
      d.socialBaseline = true;
      d.socialSeen = [...new Set([...(d.socialSeen ?? []), ...options.flatMap(keysOf)])].slice(-10000);
    });
    return 0;
  }
  const page = project.pages.find((p) => p.id === pageId);
  if (!page?.published) return 0;
  const fresh = options.filter((o) => o.source.pageId === pageId && !keysOf(o).some((k) => seen.has(k)));
  if (!fresh.length) return 0;
  await approvalsStore(siteId, (d) => {
    d.socialSeen = [...new Set([...(d.socialSeen ?? []), ...fresh.flatMap(keysOf)])].slice(-10000);
  });
  // Cards first; the page itself only when it is new as a whole (no new cards on it).
  const cards = fresh.filter((o) => o.source.kind === "item");
  const chosen = (cards.length ? cards : fresh).slice(0, MAX_NEW_PER_PUBLISH);
  let created = 0;
  for (const option of chosen) {
    const input = newPostInput.safeParse({
      source: option.source,
      sourceLocale: option.locale,
      languages: [option.locale],
      fields: { ...option.translations, [option.locale]: option.fields } as Record<string, PostFields>,
      images: [option.image],
    });
    if (!input.success) continue;
    let post = await createPost(system, siteId, input.data, suggestHashtags(project.brand.name, option.fields.title));
    try {
      post = await renderAndSave(siteId, post, ["portrait"]);
    } catch {
      // No picture render (unsupported image): the item shows the source picture.
    }
    const { created: isNew } = await enqueue(siteId, {
      type: "social_post",
      key: `social:post:${post.id}`,
      title: `New post: ${option.source.label || option.fields.title}`.slice(0, 300),
      text: previewOf(post),
      images: pictureOf(post) ? [pictureOf(post)] : [],
      ref: { postId: post.id, source: option.key },
    });
    if (isNew) created++;
  }
  return created;
}

registerApprovalProvider({
  type: "social_post",
  async apply(item, ctx) {
    const post = await readPost(item.siteId, item.ref.postId);
    const connections = await connectionStatus(item.siteId);
    const live = post.networks.filter((n) => connections.find((c) => c.network === n)?.connected);
    await postStore(item.siteId, (data) => addPostHistory(findPost(data, post.id), ctx.by, "Approved"));
    if (!live.length || ctx.mock)
      return ctx.mock
        ? "Test mode: nothing was published. The post is ready in Social posts."
        : "Social accounts are not connected yet — the post is ready in Social posts: copy the caption and download the picture.";
    // Renders for every network format (renderPost replaces earlier renders, so all at once).
    const formats = [...new Set<FormatId>(["portrait", ...live.map((n) => NETWORK_FORMAT[n])])];
    if (formats.some((f) => !post.renders.some((r) => r.format === f))) await renderAndSave(item.siteId, post, formats);
    const done: string[] = [];
    const failed: string[] = [];
    for (const network of live) {
      try {
        await publishNetwork(item.siteId, post.id, network, ctx.by);
        done.push(NETWORK_NAMES[network]);
      } catch (error) {
        failed.push(`${NETWORK_NAMES[network]} (${error instanceof StoreError ? error.message : "failed"})`);
      }
    }
    if (!done.length) throw new StoreError(`Publishing failed: ${failed.join("; ")}`.slice(0, 300), 502);
    return `Published on ${done.join(", ")}.${failed.length ? ` Not published: ${failed.join("; ")}.` : ""}`;
  },
  async skip(item, ctx) {
    await postStore(item.siteId, (data) => {
      const post = data.posts.find((p) => p.id === item.ref.postId);
      if (post) addPostHistory(post, ctx.by, "Skipped in approvals (kept as a draft)");
    });
    return "Skipped. The draft stays in Social posts.";
  },
  async revise(item, instruction, ctx) {
    const post = await readPost(item.siteId, item.ref.postId);
    const current = item.text || previewOf(post);
    const answer = await aiComplete({
      system:
        "You edit social media captions of a small business. Apply the owner's instruction to the caption. " +
        "Keep the language(s) of the caption, keep facts (prices, links) unless told otherwise, keep hashtags at the end. " +
        `At most ${CAPTION_LIMITS.instagram} characters. Answer with the new caption only.`,
      user: `Caption:\n${current}\n\nOwner's instruction: ${instruction}`,
      maxTokens: 900,
      useMock: ctx.mock,
      mock: `${current}\n\n(Test variant — instruction: ${instruction})`,
    });
    const text = answer.text.trim();
    const updated = await postStore(item.siteId, (data) => {
      const p = findPost(data, post.id);
      for (const network of NETWORKS) p.captions[network] = text.slice(0, CAPTION_LIMITS[network]);
      addPostHistory(p, ctx.by, `Caption rewritten: “${instruction.slice(0, 120)}”`);
      p.updatedAt = new Date().toISOString();
      return structuredClone(p);
    });
    return { text: previewOf(updated), cost: answer.cost, model: answer.model };
  },
});
