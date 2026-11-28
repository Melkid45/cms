"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import { withSite } from "@/lib/builder/site-client";
import { useProject } from "@/lib/builder/client";
import {
  NETWORK_NAMES,
  type ConnectionStatus,
  type PostStatus,
  type SocialPost,
  type SourceOption,
} from "@/lib/builder/social/shared";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api, card, formatDate, StatusPill } from "../orders/shared";
import { PostEditor } from "./post-editor";

export const statusLabel: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
};
interface Overview {
  posts: SocialPost[];
  sources: SourceOption[];
  connections: ConnectionStatus[];
  languages: string[];
  defaultLanguage: string;
  brand: string;
  ai: { enabled: boolean; model: string; spent: number; cap: number };
}
export interface SocialInfo {
  languages: string[];
  connections: ConnectionStatus[];
  ai: Overview["ai"];
  sourceImages: (post: SocialPost) => string[];
}

export function SocialPosts() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string>("");
  const [picker, setPicker] = useState(false);
  const { project } = useProject();
  useEffect(() => {
    let active = true;
    api<Overview>(withSite("/api/builder/social"))
      .then((d) => {
        if (!active) return;
        setData(d);
        const id = new URLSearchParams(location.search).get("post");
        if (id && d.posts.some((p) => p.id === id)) setOpen(id);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  // Keeps ?post= in the address so a reload reopens the same post.
  function show(id: string) {
    setOpen(id);
    const url = new URL(location.href);
    if (id) url.searchParams.set("post", id);
    else url.searchParams.delete("post");
    history.replaceState(history.state, "", url);
  }
  const info = useMemo<SocialInfo | null>(
    () =>
      data && {
        languages: data.languages,
        connections: data.connections,
        ai: data.ai,
        sourceImages: (post) =>
          data.sources.find(
            (s) =>
              s.source.kind === post.source.kind &&
              s.source.pageId === post.source.pageId &&
              s.source.itemId === post.source.itemId,
          )?.images ?? [],
      },
    [data],
  );
  const libraryImages = useMemo(
    () =>
      (project?.media ?? [])
        .filter((m) => !m.name.startsWith("social-") && m.mime !== "image/svg+xml")
        .map((m) => ({ url: m.url, name: m.name })),
    [project],
  );
  const replace = (post: SocialPost) =>
    setData((d) =>
      d && {
        ...d,
        posts: d.posts.some((p) => p.id === post.id)
          ? d.posts.map((p) => (p.id === post.id ? post : p))
          : [post, ...d.posts],
      },
    );
  const current = data?.posts.find((p) => p.id === open);

  if (current && info)
    return (
      <PostEditor
        key={current.id}
        post={current}
        info={info}
        libraryImages={libraryImages}
        onChange={replace}
        onClose={() => {
          show("");
          // Duplicates are created from the editor: refresh the list.
          api<Overview>(withSite("/api/builder/social")).then(setData).catch(() => {});
        }}
        onDeleted={(id) => {
          setData((d) => d && { ...d, posts: d.posts.filter((p) => p.id !== id) });
          show("");
        }}
      />
    );

  return (
    <AdminPanel
      title="Social posts"
      className="min-w-0"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          <Button disabled={!data} onClick={() => setPicker(true)}>
            <Plus /> New post
          </Button>
        }</div>}
    >
      {error && <p className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {data && (
        <div className="mb-6 flex flex-wrap gap-2">
          {data.connections.map((c) => (
            <span
              key={c.network}
              className={cn(
                "inline-flex h-7 items-center rounded-full px-3 text-xs",
                c.connected ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-600",
              )}
            >
              {NETWORK_NAMES[c.network]}: {c.connected ? c.account : "not connected"}
            </span>
          ))}
          {!data.connections.some((c) => c.connected) && (
            <span className="inline-flex h-7 items-center text-xs text-neutral-500">
              Publish by hand (copy caption, download images) or ask the administrator to connect
              the accounts.
            </span>
          )}
        </div>
      )}
      {!data && !error && <p className="text-sm text-neutral-500">Loading…</p>}
      {data && !data.posts.length && (
        <div className={cn(card, "grid place-items-center gap-3 p-10 text-center")}>
          <p className="text-base font-medium">No posts yet</p>
          <p className="max-w-md text-sm text-neutral-500">
            Pick a product card, a work or a page: the text, price and link are filled in for you,
            and the picture is cut for every network.
          </p>
          <Button onClick={() => setPicker(true)}>
            <Plus /> Create the first post
          </Button>
        </div>
      )}
      {data && data.posts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.posts.map((post) => {
            const thumb =
              post.renders.find((r) => r.format === "square")?.url || post.images[0];
            return (
              <button
                key={post.id}
                type="button"
                onClick={() => show(post.id)}
                className={cn(
                  card,
                  "group flex min-w-0 gap-4 p-3 text-left transition-colors hover:bg-neutral-50",
                )}
              >
                {thumb ? (
                  <img src={thumb} alt="" loading="lazy" className="size-20 shrink-0 rounded-lg bg-neutral-100 object-cover" />
                ) : (
                  <span className="size-20 shrink-0 rounded-lg bg-neutral-100" />
                )}
                <span className="grid min-w-0 flex-1 content-start gap-1">
                  <span className="truncate text-sm font-medium">{post.name}</span>
                  <span className="truncate text-xs text-neutral-500">{post.source.label}</span>
                  <span className="truncate text-xs text-neutral-500">
                    {post.networks.map((n) => NETWORK_NAMES[n]).join(", ") || "No network"}
                    {" · "}
                    {post.languages.map((l) => l.toUpperCase()).join(" ")}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusPill status={post.status} label={statusLabel[post.status]} />
                    <span className="text-xs text-neutral-400">
                      {post.status === "scheduled" ? formatDate(post.scheduledAt) : formatDate(post.updatedAt)}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {picker && data && (
        <SourcePicker
          sources={data.sources}
          onClose={() => setPicker(false)}
          onCreate={async (sourceKey) => {
            const post = await api<SocialPost>(withSite("/api/builder/social"), {
              method: "POST",
              body: JSON.stringify(sourceKey ? { sourceKey } : {}),
            });
            replace(post);
            setPicker(false);
            show(post.id);
          }}
        />
      )}
    </AdminPanel>
  );
}

function SourcePicker({
  sources,
  onClose,
  onCreate,
}: {
  sources: SourceOption[];
  onClose: () => void;
  onCreate: (sourceKey?: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"item" | "page">("item");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const list = sources
    .filter((s) => s.source.kind === tab)
    .filter((s) =>
      `${s.source.label} ${s.fields.price} ${s.locale}`.toLowerCase().includes(query.toLowerCase()),
    );
  async function create(key?: string) {
    setBusy(key || "free");
    setError("");
    try {
      await onCreate(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the post.");
      setBusy("");
    }
  }
  // Portal: the dashboard page animates with a transform, which would trap a fixed overlay.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create post from"
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[min(760px,calc(100dvh-32px))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-3 px-5 pt-5 sm:px-6">
          <h2 className="text-lg font-semibold">Create post from…</h2>
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="flex flex-col gap-3 px-5 pt-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
            {(
              [
                ["item", "Products & works"],
                ["page", "Pages"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm whitespace-nowrap",
                  tab === id ? "bg-neutral-900 font-medium text-white" : "text-neutral-600",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
            <Input
              aria-label="Search"
              className="pl-9"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="mx-6 mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-6">
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((s) => (
              <button
                key={s.key}
                type="button"
                disabled={!!busy}
                onClick={() => create(s.key)}
                className="flex min-w-0 items-center gap-3 rounded-xl p-2 text-left hover:bg-neutral-50 disabled:opacity-60"
              >
                <img src={s.image} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg bg-neutral-100 object-cover" />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-medium">{s.fields.title}</span>
                  <span className="truncate text-xs text-neutral-500">
                    {s.source.kind === "item" ? s.source.label.split(" → ")[0] : "Page"}
                    {s.fields.price ? ` · ${s.fields.price}` : ""}
                    {` · ${s.locale.toUpperCase()}`}
                  </span>
                </span>
                {busy === s.key && <span className="ml-auto text-xs text-neutral-500">Creating…</span>}
              </button>
            ))}
          </div>
          {!list.length && <p className="py-8 text-center text-sm text-neutral-500">Nothing found.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-neutral-50 px-5 py-4 sm:px-6">
          <span className="text-xs text-neutral-500">Or write a post that is not tied to a page.</span>
          <Button variant="outline" className="ml-auto" disabled={!!busy} onClick={() => create()}>
            Free post
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
