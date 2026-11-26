import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withDoc } from "../doc-store";
import { StoreError } from "../server";
import type { Identity } from "../access";
import { LOCALES } from "../i18n";
import {
  FORMATS,
  NETWORKS,
  POST_STATUSES,
  type PostFields,
  type SocialPost,
} from "./shared";

// Social posts of one website: installation document `social:{siteId}`
// (PostgreSQL row or .data/social-{siteId}.json).
type Store = { posts: SocialPost[] };
const MAX_POSTS = 500;
export const postStore = <T>(
  siteId: string,
  fn: (data: Store) => T | Promise<T>,
  write = true,
) => withDoc<Store, T>(`social:${siteId}`, () => ({ posts: [] }), fn, write);

const text = (max: number) => z.string().max(max);
const imageUrl = z
  .string()
  .max(1000)
  .refine(
    (url) => url.startsWith("/") || /^https:\/\//.test(url),
    "Use an image from the media library.",
  );
const fields = z
  .object({
    title: text(300),
    description: text(5000),
    price: text(60),
    link: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(1000)]),
  })
  .strict();
const locale = z.enum(LOCALES);
const network = z.enum(NETWORKS);
const source = z
  .object({
    kind: z.enum(["page", "item", "free"]),
    pageId: text(100).optional(),
    sectionId: text(100).optional(),
    itemId: text(100).optional(),
    label: text(300),
    type: z.enum(["product", "work"]).optional(),
  })
  .strict();

export const newPostInput = z
  .object({
    name: text(200).optional(),
    source,
    sourceLocale: locale,
    languages: z.array(locale).min(1).max(4).optional(),
    fields: z.partialRecord(locale, fields),
    images: z.array(imageUrl).max(10),
  })
  .strict();

export const postUpdate = z
  .object({
    id: text(100),
    name: text(200).optional(),
    languages: z.array(locale).min(1).max(4).optional(),
    fields: z.partialRecord(locale, fields).optional(),
    networks: z.array(network).max(3).optional(),
    captions: z.partialRecord(network, text(63206)).optional(),
    hashtags: text(2000).optional(),
    images: z.array(imageUrl).max(10).optional(),
    focal: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .strict()
      .optional(),
    brandBar: z.boolean().optional(),
    fit: z.enum(["cover", "contain"]).optional(),
  })
  .strict();

export const postAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("schedule"),
      id: text(100),
      // ISO date; null clears the schedule.
      at: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("mark-published"),
      id: text(100),
      network,
      url: z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(1000)]),
    })
    .strict(),
  z
    .object({ action: z.literal("publish"), id: text(100), network })
    .strict(),
  z.object({ action: z.literal("delete"), id: text(100) }).strict(),
  z.object({ action: z.literal("duplicate"), id: text(100) }).strict(),
]);

export const renderInput = z
  .object({
    id: text(100),
    formats: z
      .array(z.enum(FORMATS.map((f) => f.id) as [string, ...string[]]))
      .min(1)
      .max(4)
      .optional(),
  })
  .strict();

export const aiInput = z
  .object({ id: text(100), network })
  .strict();

const who = (viewer: Pick<Identity, "name" | "email">) =>
  viewer.name || viewer.email || "Owner";
export function addHistory(post: SocialPost, by: string, entry: string) {
  post.history.unshift({ at: new Date().toISOString(), by, text: entry });
  post.history = post.history.slice(0, 50);
}

export const listPosts = (siteId: string) =>
  postStore(siteId, (data) => data.posts, false);

export async function createPost(
  viewer: Identity,
  siteId: string,
  input: z.infer<typeof newPostInput>,
  hashtags: string,
) {
  return postStore(siteId, (data) => {
    if (data.posts.length >= MAX_POSTS)
      throw new StoreError("Delete old posts before creating new ones.", 429);
    const now = new Date().toISOString();
    const main = input.fields[input.sourceLocale] as PostFields | undefined;
    const post: SocialPost = {
      id: randomUUID(),
      siteId,
      name: input.name || main?.title || input.source.label || "New post",
      source: input.source,
      sourceLocale: input.sourceLocale,
      languages: input.languages ?? [input.sourceLocale],
      fields: input.fields as Record<string, PostFields>,
      networks: ["instagram", "facebook"],
      captions: {},
      hashtags,
      images: input.images,
      focal: { x: 0.5, y: 0.5 },
      brandBar: false,
      fit: input.source.type === "product" ? "contain" : "cover",
      renders: [],
      status: "draft",
      results: {},
      history: [],
      createdAt: now,
      updatedAt: now,
      createdBy: who(viewer),
    };
    addHistory(post, who(viewer), `Created from ${input.source.label || "scratch"}`);
    data.posts.unshift(post);
    return post;
  });
}

export function findPost(data: Store, id: string) {
  const post = data.posts.find((p) => p.id === id);
  if (!post) throw new StoreError("Post not found.", 404);
  return post;
}

export async function updatePost(
  viewer: Identity,
  siteId: string,
  input: z.infer<typeof postUpdate>,
) {
  return postStore(siteId, (data) => {
    const post = findPost(data, input.id);
    const { id: _id, ...changes } = input;
    void _id;
    Object.assign(post, Object.fromEntries(
      Object.entries(changes).filter(([, v]) => v !== undefined),
    ));
    post.updatedAt = new Date().toISOString();
    return post;
  });
}

// Actions that do not call a network (publish is handled in publish.ts).
export async function postCommand(
  viewer: Identity,
  siteId: string,
  input: Exclude<z.infer<typeof postAction>, { action: "publish" }>,
) {
  return postStore(siteId, (data) => {
    const post = findPost(data, input.id);
    const by = who(viewer);
    const now = new Date().toISOString();
    if (input.action === "delete") {
      data.posts = data.posts.filter((p) => p.id !== post.id);
      return { deleted: post.id, renders: post.renders };
    }
    if (input.action === "duplicate") {
      const copy: SocialPost = {
        ...structuredClone(post),
        id: randomUUID(),
        name: `${post.name} (copy)`,
        status: "draft",
        scheduledAt: undefined,
        renders: [],
        results: {},
        history: [],
        createdAt: now,
        updatedAt: now,
        createdBy: by,
      };
      addHistory(copy, by, `Copied from “${post.name}”`);
      data.posts.unshift(copy);
      return copy;
    }
    if (input.action === "schedule") {
      if (input.at) {
        if (new Date(input.at).getTime() < Date.now() + 60_000)
          throw new StoreError("Choose a time in the future.");
        post.scheduledAt = new Date(input.at).toISOString();
        if (post.status !== "published") post.status = "scheduled";
        addHistory(post, by, `Scheduled for ${post.scheduledAt}`);
      } else {
        post.scheduledAt = undefined;
        if (post.status === "scheduled") post.status = "draft";
        addHistory(post, by, "Schedule removed");
      }
    } else {
      post.results[input.network] = {
        status: "published",
        url: input.url || undefined,
        at: now,
        manual: true,
      };
      if (!post.networks.includes(input.network))
        post.networks.push(input.network);
      // Published as soon as one network has it; per-network results show the rest.
      post.status = "published";
      addHistory(
        post,
        by,
        `Marked as published on ${input.network}${input.url ? `: ${input.url}` : ""}`,
      );
    }
    post.updatedAt = now;
    return post;
  });
}

export { POST_STATUSES };
