import "server-only";
import { readRegistry } from "../sites";
import { StoreError } from "../server";
import { connected, publicBase } from "./accounts";
import { publishFacebook, publishInstagram, publishTikTok } from "./providers";
import { addHistory, findPost, postStore } from "./store";
import {
  NETWORK_FORMAT,
  NETWORK_NAMES,
  templateCaption,
  type Network,
  type SocialPost,
} from "./shared";

const providers = {
  facebook: publishFacebook,
  instagram: publishInstagram,
  tiktok: publishTikTok,
};

// Public JPEG address of a render (Instagram accepts JPEG only; TikTok pulls from the
// verified admin domain).
export const renderAddress = (siteId: string, mediaId: string) =>
  `${publicBase()}/api/social/image/${siteId}/${mediaId}.jpg`;

export function captionFor(post: SocialPost, network: Network) {
  return (
    post.captions[network]?.trim() ||
    templateCaption({
      network,
      languages: post.languages,
      fields: post.fields,
      sourceLocale: post.sourceLocale,
      hashtags: post.hashtags,
      type: post.source.type,
    })
  );
}

// Publishes one post to one network. Refuses (409) unless that network is connected.
export async function publishNetwork(
  siteId: string,
  postId: string,
  network: Network,
  by: string,
) {
  if (!(await connected(siteId, network)))
    throw new StoreError(
      `${NETWORK_NAMES[network]} is not connected — ask the administrator.`,
      409,
    );
  const post = await postStore(siteId, (data) => findPost(data, postId), false);
  const format = NETWORK_FORMAT[network];
  const renders = post.renders.filter((r) => r.format === format);
  if (!renders.length)
    throw new StoreError("Render the images first (Images → Render formats).", 409);
  const title = (post.fields[post.sourceLocale] ?? Object.values(post.fields)[0])?.title || post.name;
  let outcome: { ok: true; id: string; url?: string } | { ok: false; error: string };
  try {
    const result = await providers[network]({
      siteId,
      caption: captionFor(post, network),
      images: renders.map((r) => renderAddress(siteId, r.mediaId)),
      title,
    });
    outcome = { ok: true, id: result.externalId, url: result.url };
  } catch (error) {
    outcome = {
      ok: false,
      error: error instanceof StoreError ? error.message : "Publishing failed.",
    };
  }
  return postStore(siteId, (data) => {
    const current = findPost(data, postId);
    const at = new Date().toISOString();
    current.results[network] = outcome.ok
      ? { status: "published", externalId: outcome.id, url: outcome.url, at }
      : { status: "failed", error: outcome.error, at };
    const results = current.networks.map((n) => current.results[n]?.status);
    current.status = results.some((s) => s === "published")
      ? "published"
      : results.some((s) => s === "failed")
        ? "failed"
        : current.status;
    addHistory(
      current,
      by,
      outcome.ok
        ? `Published on ${NETWORK_NAMES[network]}`
        : `${NETWORK_NAMES[network]} failed: ${outcome.error}`,
    );
    current.updatedAt = at;
    return current;
  });
}

// Cron: publishes scheduled posts that are due, on every selected network that is
// connected. Without connected accounts nothing happens (the post stays scheduled).
export async function publishDuePosts() {
  const registry = await readRegistry();
  let published = 0,
    skipped = 0;
  for (const site of registry.sites) {
    const due = await postStore(
      site.id,
      (data) =>
        data.posts.filter(
          (p) =>
            p.status === "scheduled" &&
            p.scheduledAt &&
            new Date(p.scheduledAt).getTime() <= Date.now(),
        ),
      false,
    );
    for (const post of due)
      for (const network of post.networks) {
        if (post.results[network]?.status === "published") continue;
        if (!(await connected(site.id, network))) {
          skipped++;
          continue;
        }
        await publishNetwork(site.id, post.id, network, "Schedule");
        published++;
      }
  }
  return { published, skipped };
}
