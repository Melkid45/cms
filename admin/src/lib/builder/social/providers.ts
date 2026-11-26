import "server-only";
import { StoreError } from "../server";
import { GRAPH, metaPage, TIKTOK_API, tiktokAccess } from "./accounts";

// Request code paths of the three networks, per their official docs (2026-11):
// - Facebook Pages API: POST /{page-id}/photos (url, caption) with a Page access token.
// - Instagram content publishing (Facebook Login, IG professional account linked to the
//   Page): POST /{ig-id}/media (image_url JPEG, caption | is_carousel_item) →
//   CAROUSEL container (children) → POST /{ig-id}/media_publish (creation_id).
// - TikTok Content Posting API, photo post: POST /v2/post/publish/content/init/
//   (media_type PHOTO, source PULL_FROM_URL, photo_images ≤ 35 from a verified
//   URL prefix) after /v2/post/publish/creator_info/query/ for privacy options.
// Called only for websites whose owner connected the account (see accounts.ts).

export interface PublishInput {
  siteId: string;
  caption: string;
  // Public https JPEG/WebP URLs of the renders, first = cover.
  images: string[];
  title: string;
}
export interface PublishResult {
  externalId: string;
  url?: string;
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: string } | string;
  };
  const error =
    typeof data.error === "object" && data.error
      ? data.error.code && data.error.code !== "ok"
        ? data.error.message || data.error.code
        : !response.ok
          ? data.error.message
          : undefined
      : !response.ok
        ? String(data.error || response.status)
        : undefined;
  if (error) throw new StoreError(`The network refused: ${error}`, 502);
  return data;
}
const form = (values: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(values),
});

export async function publishFacebook(input: PublishInput): Promise<PublishResult> {
  const page = await metaPage(input.siteId);
  const result = await call<{ id: string; post_id?: string }>(
    `${GRAPH}/${page.id}/photos`,
    form({ url: input.images[0], caption: input.caption, access_token: page.token }),
  );
  const id = result.post_id || result.id;
  return { externalId: id, url: `https://www.facebook.com/${id}` };
}

export async function publishInstagram(input: PublishInput): Promise<PublishResult> {
  const page = await metaPage(input.siteId);
  if (!page.instagram || !page.useInstagram)
    throw new StoreError("No Instagram account is linked to the Facebook Page.", 409);
  const ig = page.instagram.id,
    token = page.token;
  const images = input.images.slice(0, 10);
  let creation: string;
  if (images.length === 1) {
    creation = (
      await call<{ id: string }>(
        `${GRAPH}/${ig}/media`,
        form({ image_url: images[0], caption: input.caption, access_token: token }),
      )
    ).id;
  } else {
    const children: string[] = [];
    for (const image of images)
      children.push(
        (
          await call<{ id: string }>(
            `${GRAPH}/${ig}/media`,
            form({ image_url: image, is_carousel_item: "true", access_token: token }),
          )
        ).id,
      );
    creation = (
      await call<{ id: string }>(
        `${GRAPH}/${ig}/media`,
        form({
          media_type: "CAROUSEL",
          children: children.join(","),
          caption: input.caption,
          access_token: token,
        }),
      )
    ).id;
  }
  // Image containers are usually FINISHED at once; check a few times before publishing.
  for (let attempt = 0; attempt < 5; attempt++) {
    const status = await call<{ status_code?: string }>(
      `${GRAPH}/${creation}?${new URLSearchParams({ fields: "status_code", access_token: token })}`,
      { method: "GET" },
    );
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED")
      throw new StoreError("Instagram could not process the image.", 502);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  const published = await call<{ id: string }>(
    `${GRAPH}/${ig}/media_publish`,
    form({ creation_id: creation, access_token: token }),
  );
  let url: string | undefined;
  try {
    url = (
      await call<{ permalink?: string }>(
        `${GRAPH}/${published.id}?${new URLSearchParams({ fields: "permalink", access_token: token })}`,
        { method: "GET" },
      )
    ).permalink;
  } catch {}
  return { externalId: published.id, url };
}

export async function publishTikTok(input: PublishInput): Promise<PublishResult> {
  const token = await tiktokAccess(input.siteId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=UTF-8",
  };
  const creator = await call<{ data?: { privacy_level_options?: string[] } }>(
    `${TIKTOK_API}/post/publish/creator_info/query/`,
    { method: "POST", headers },
  );
  const options = creator.data?.privacy_level_options ?? [];
  // Unaudited apps may only post privately; audited apps post publicly.
  const privacy = options.includes("PUBLIC_TO_EVERYONE")
    ? "PUBLIC_TO_EVERYONE"
    : options[0] || "SELF_ONLY";
  const result = await call<{ data?: { publish_id?: string } }>(
    `${TIKTOK_API}/post/publish/content/init/`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        post_info: {
          title: input.title.slice(0, 90),
          description: input.caption.slice(0, 4000),
          privacy_level: privacy,
          disable_comment: false,
          auto_add_music: true,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: 0,
          photo_images: input.images.slice(0, 35),
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      }),
    },
  );
  const id = result.data?.publish_id;
  if (!id) throw new StoreError("TikTok did not accept the post.", 502);
  return { externalId: id };
}
