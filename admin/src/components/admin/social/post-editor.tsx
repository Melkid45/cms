"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { withSite } from "@/lib/builder/site-client";
import { LOCALE_NAMES, LOCALES } from "@/lib/builder/i18n";
import {
  CAPTION_LIMITS,
  captionProblems,
  FORMATS,
  NETWORK_FORMAT,
  NETWORK_LINKS,
  NETWORK_NAMES,
  NETWORKS,
  normalizeHashtags,
  templateCaption,
  trackedLink,
  type Network,
  type PostFields,
  type SocialPost,
} from "@/lib/builder/social/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api, card, formatDate, StatusPill } from "../orders/shared";
import { statusLabel, type SocialInfo } from "./social-posts";

const emptyFields: PostFields = { title: "", description: "", price: "", link: "" };
const section = cn(card, "p-5 sm:p-6");
const heading = "text-base font-semibold";
const hint = "text-xs leading-5 text-neutral-500";
const chip = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center rounded-full px-3 text-sm transition-shadow",
    on
      ? "bg-neutral-900 text-white"
      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
  );

type Editable = Pick<
  SocialPost,
  | "name"
  | "languages"
  | "fields"
  | "networks"
  | "captions"
  | "hashtags"
  | "images"
  | "focal"
  | "brandBar"
  | "fit"
>;
const editable = (post: SocialPost): Editable => ({
  name: post.name,
  languages: post.languages,
  fields: post.fields,
  networks: post.networks,
  captions: post.captions,
  hashtags: post.hashtags,
  images: post.images,
  focal: post.focal,
  brandBar: post.brandBar,
  fit: post.fit ?? "cover",
});

export function PostEditor({
  post: initial,
  info,
  libraryImages,
  onChange,
  onClose,
  onDeleted,
}: {
  post: SocialPost;
  info: SocialInfo;
  libraryImages: { url: string; name: string }[];
  onChange: (post: SocialPost) => void;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [post, setPost] = useState(initial);
  const [saving, setSaving] = useState<"" | "saving" | "saved" | "error">("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [locale, setLocale] = useState(initial.sourceLocale);
  const [morePictures, setMorePictures] = useState(false);
  const [aiCost, setAiCost] = useState("");
  const [markUrl, setMarkUrl] = useState<Partial<Record<Network, string>>>({});
  const [markOpen, setMarkOpen] = useState<Network | "">("");
  const [when, setWhen] = useState(() => toLocalInput(initial.scheduledAt));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Editable | null>(null);
  const saving$ = useRef<Promise<void> | null>(null);

  // Autosave 0.8 s after the last change; actions flush first.
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await saving$.current;
    const changes = pending.current;
    if (!changes) return;
    pending.current = null;
    setSaving("saving");
    saving$.current = api<SocialPost>(withSite("/api/builder/social"), {
      method: "PATCH",
      body: JSON.stringify({ id: post.id, ...changes }),
    })
      .then((saved) => {
        onChange(saved);
        setSaving(pending.current ? "saving" : "saved");
      })
      .catch((e) => {
        pending.current = { ...changes, ...(pending.current ?? {}) };
        setSaving("error");
        setError(e.message);
      });
    await saving$.current;
  }
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  function edit(changes: Partial<Editable>) {
    setPost((current) => {
      const next = { ...current, ...changes };
      pending.current = { ...editable(next) };
      return next;
    });
    setSaving("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }
  async function run(label: string, body: object, done?: string) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await flush();
      const result = await api<SocialPost>(withSite("/api/builder/social"), {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setPost(result);
      onChange(result);
      if (done) setNotice(done);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  const fieldsFor = (l: string) => post.fields[l] ?? post.fields[post.sourceLocale] ?? emptyFields;
  const ownText = (l: string) => !!post.fields[l];
  const setField = (key: keyof PostFields, value: string) =>
    edit({ fields: { ...post.fields, [locale]: { ...fieldsFor(locale), [key]: value } } });
  const languages = [...new Set([...info.languages, ...LOCALES])];
  const connection = (n: Network) => info.connections.find((c) => c.network === n);
  const caption = (n: Network) =>
    post.captions[n] ??
    templateCaption({
      network: n,
      languages: post.languages,
      fields: post.fields,
      sourceLocale: post.sourceLocale,
      hashtags: post.hashtags,
      type: post.source.type,
    });
  const candidates = [...new Set([...post.images, ...info.sourceImages(post)])];
  const main = post.images[0];
  const rendersBy = (image: string) => post.renders.filter((r) => r.image === image);

  async function render() {
    setBusy("render");
    setError("");
    setNotice("");
    try {
      await flush();
      const result = await api<SocialPost>(withSite("/api/builder/social/render"), {
        method: "POST",
        body: JSON.stringify({ id: post.id }),
      });
      setPost(result);
      onChange(result);
      setNotice(`${result.renders.length} images saved to the media library.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not render.");
    } finally {
      setBusy("");
    }
  }
  async function generateAi(n: Network) {
    setBusy("ai-" + n);
    setError("");
    try {
      await flush();
      const result = await api<{ caption: string; cost: number; model: string }>(
        withSite("/api/builder/social/caption"),
        { method: "POST", body: JSON.stringify({ id: post.id, network: n }) },
      );
      edit({ captions: { ...post.captions, [n]: result.caption } });
      setAiCost(`Last AI caption: $${result.cost.toFixed(5)} (${result.model}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI did not answer.");
    } finally {
      setBusy("");
    }
  }
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what} copied.`);
    } catch {
      setError("Copy is blocked by the browser. Select the text and copy it.");
    }
  }

  return (
    <div className="rise-in min-w-0">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={async () => { await flush(); onClose(); }}>
          <ArrowLeft /> All posts
        </Button>
        <span className="ml-auto text-xs text-neutral-500" role="status">
          {saving === "saving" ? "Saving…" : saving === "saved" ? "Draft saved" : saving === "error" ? "Not saved" : ""}
        </span>
        <StatusPill status={post.status} label={statusLabel[post.status]} />
      </div>
      <Input
        aria-label="Post name"
        value={post.name}
        onChange={(e) => edit({ name: e.target.value })}
        className="mb-1 h-11 max-w-2xl text-lg font-semibold"
      />
      <p className={cn(hint, "mb-6")}>
        From: {post.source.label}
        {post.source.kind !== "free" && fieldsFor(post.sourceLocale).link ? (
          <>
            {" · "}
            <a className="underline" href={fieldsFor(post.sourceLocale).link} target="_blank" rel="noreferrer">
              open page
            </a>
          </>
        ) : null}
      </p>
      {(notice || error) && (
        <p
          role="status"
          className={cn(
            "mb-5 rounded-lg px-4 py-3 text-sm",
            error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800",
          )}
        >
          {error || notice}
        </p>
      )}

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="grid min-w-0 gap-5">
          {/* Content */}
          <section className={section}>
            <h2 className={heading}>Text</h2>
            <p className={cn(hint, "mt-1")}>
              Languages of the caption. Website languages come first; a language without its
              own page text uses the {LOCALE_NAMES[post.sourceLocale] || post.sourceLocale} text
              until you translate it here.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {languages.map((l) => {
                const on = post.languages.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    className={chip(on)}
                    aria-pressed={on}
                    onClick={() => {
                      const next = on
                        ? post.languages.filter((x) => x !== l)
                        : [...post.languages, l];
                      if (!next.length) return;
                      edit({ languages: next });
                      if (!on) setLocale(l);
                    }}
                  >
                    {l.toUpperCase()}
                    {!info.languages.includes(l) && <span className="ml-1 opacity-60">·</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1">
              {post.languages.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  className={cn(
                    "h-8 flex-1 rounded-md px-3 text-sm",
                    locale === l ? "bg-white font-medium shadow-sm" : "text-neutral-600",
                  )}
                >
                  {LOCALE_NAMES[l] || l}
                  {!ownText(l) && " (copy)"}
                </button>
              ))}
            </div>
            {post.languages.includes(locale) && (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1.5 text-sm">
                  Title
                  <Input value={fieldsFor(locale).title} onChange={(e) => setField("title", e.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm">
                  Short description
                  <Textarea
                    rows={3}
                    value={fieldsFor(locale).description}
                    onChange={(e) => setField("description", e.target.value)}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <label className="grid gap-1.5 text-sm">
                    Price
                    <Input value={fieldsFor(locale).price} placeholder="—" onChange={(e) => setField("price", e.target.value)} />
                  </label>
                  <label className="grid min-w-0 gap-1.5 text-sm">
                    Link
                    <Input value={fieldsFor(locale).link} placeholder="https://…" onChange={(e) => setField("link", e.target.value)} />
                  </label>
                </div>
                {fieldsFor(locale).link && (
                  <p className={cn(hint, "break-all")}>
                    Facebook link with tracking: {trackedLink(fieldsFor(locale).link, "facebook")}
                  </p>
                )}
              </div>
            )}
            <label className="mt-4 grid gap-1.5 text-sm">
              Hashtags
              <Input
                value={post.hashtags}
                onChange={(e) => edit({ hashtags: e.target.value })}
                onBlur={(e) => edit({ hashtags: normalizeHashtags(e.target.value) })}
                placeholder="#brand #product"
              />
            </label>
          </section>

          {/* Captions */}
          <section className={section}>
            <h2 className={heading}>Networks and captions</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {NETWORKS.map((n) => {
                const on = post.networks.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    className={chip(on)}
                    onClick={() =>
                      edit({
                        networks: on ? post.networks.filter((x) => x !== n) : [...post.networks, n],
                      })
                    }
                  >
                    {NETWORK_NAMES[n]}
                  </button>
                );
              })}
            </div>
            {!info.ai.enabled && (
              <p className={cn(hint, "mt-3")}>
                Captions are written from a template (title, description, price, call to action,
                hashtags). AI captions are switched off — the administrator can turn them on (paid).
              </p>
            )}
            {info.ai.enabled && (
              <p className={cn(hint, "mt-3")}>
                AI captions: {info.ai.model}, usually under $0.001 each. This month $
                {info.ai.spent.toFixed(4)} of ${info.ai.cap}. {aiCost}
              </p>
            )}
            <div className="mt-4 grid gap-5">
              {post.networks.map((n) => {
                const text = caption(n);
                const problems = captionProblems(n, text);
                return (
                  <div key={n} className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{NETWORK_NAMES[n]}</span>
                      <span
                        className={cn(
                          "text-xs",
                          problems.length ? "text-red-600" : "text-neutral-500",
                        )}
                      >
                        {text.length.toLocaleString("en")} / {CAPTION_LIMITS[n].toLocaleString("en")}
                        {post.captions[n] === undefined && " · from template"}
                      </span>
                    </div>
                    <Textarea
                      rows={7}
                      className="max-h-80"
                      aria-label={`${NETWORK_NAMES[n]} caption`}
                      value={text}
                      onChange={(e) => edit({ captions: { ...post.captions, [n]: e.target.value } })}
                    />
                    {problems.length > 0 && (
                      <p className="text-xs text-red-600">{problems.join(" · ")}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const captions = { ...post.captions };
                          delete captions[n];
                          edit({ captions });
                        }}
                      >
                        <Wand2 /> Fill from template
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!info.ai.enabled || busy === "ai-" + n}
                        title={info.ai.enabled ? "Paid AI call" : "AI is switched off"}
                        onClick={() => generateAi(n)}
                      >
                        <Sparkles /> {busy === "ai-" + n ? "Writing…" : "Generate with AI"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copy(text, "Caption")}>
                        <Copy /> Copy caption
                      </Button>
                    </div>
                  </div>
                );
              })}
              {!post.networks.length && <p className={hint}>Choose at least one network.</p>}
            </div>
          </section>

          <section className={section}>
            <h2 className={heading}>History</h2>
            <ul className="mt-3 grid gap-2">
              {post.history.map((h, i) => (
                <li key={i} className="text-sm">
                  <span className="text-neutral-500">{formatDate(h.at)} · {h.by} — </span>
                  <span className="break-words">{h.text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={async () => {
                  await flush();
                  const copyPost = await run("duplicate", { action: "duplicate", id: post.id });
                  if (copyPost) setNotice("Copy created — find it in the list.");
                }}
              >
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!!busy}
                onClick={async () => {
                  if (!confirm("Delete this post and its rendered images?")) return;
                  try {
                    await api(withSite("/api/builder/social"), {
                      method: "PATCH",
                      body: JSON.stringify({ action: "delete", id: post.id }),
                    });
                    onDeleted(post.id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not delete.");
                  }
                }}
              >
                <Trash2 /> Delete
              </Button>
            </div>
          </section>
        </div>

        <div className="grid min-w-0 gap-5">
          {/* Images */}
          <section className={section}>
            <h2 className={heading}>Images</h2>
            <p className={cn(hint, "mt-1")}>
              The first selected image is the cover. Click it to set the point the crops keep
              in view.
            </p>
            {main ? (
              <FocalPicker
                url={main}
                focal={post.focal}
                onPick={(focal) => edit({ focal })}
              />
            ) : (
              <p className="mt-4 rounded-lg bg-neutral-50 p-6 text-center text-sm text-neutral-500">
                Select an image below.
              </p>
            )}
            {main && (
              <div className="mt-3 grid grid-cols-4 items-end gap-2">
                {FORMATS.map((f) => (
                  <figure key={f.id} className="grid gap-1">
                    <img
                      src={main}
                      alt=""
                      className={cn(
                        "w-full rounded bg-neutral-100",
                        post.fit === "contain" ? "bg-white object-contain p-[7%]" : "object-cover",
                      )}
                      style={{
                        aspectRatio: `${f.width} / ${f.height}`,
                        objectPosition: `${post.focal.x * 100}% ${post.focal.y * 100}%`,
                      }}
                    />
                    <figcaption className="text-center text-[11px] text-neutral-500">{f.label}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-5">
              {(morePictures
                ? [...new Set([...candidates, ...libraryImages.map((m) => m.url)])]
                : candidates
              ).map((url) => {
                const index = post.images.indexOf(url);
                return (
                  <button
                    key={url}
                    type="button"
                    aria-pressed={index >= 0}
                    title={index === 0 ? "Cover" : index > 0 ? `Image ${index + 1}` : "Add"}
                    onClick={() =>
                      edit({
                        images:
                          index >= 0
                            ? post.images.filter((u) => u !== url)
                            : [...post.images, url].slice(0, 10),
                      })
                    }
                    className={cn(
                      "relative overflow-hidden rounded-lg bg-neutral-100",
                      index >= 0 ? "ring-2 ring-neutral-900" : "opacity-70 hover:opacity-100",
                    )}
                  >
                    <img src={url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                    {index >= 0 && (
                      <span className="absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-neutral-900 text-[11px] text-white">
                        {index + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-2 text-xs text-neutral-600 underline"
              onClick={() => setMorePictures((v) => !v)}
            >
              {morePictures ? "Show only this source's images" : "Choose from the media library"}
            </button>
            <label className="mt-4 flex items-center gap-3 text-sm">
              <Switch
                checked={post.fit === "contain"}
                onCheckedChange={(v) => edit({ fit: v ? "contain" : "cover" })}
              />
              Fit the whole picture (product shots on a plain background)
            </label>
            <label className="mt-3 flex items-center gap-3 text-sm">
              <Switch checked={post.brandBar} onCheckedChange={(v) => edit({ brandBar: v })} />
              Brand caption bar (website colours, title and name)
            </label>
            <Button className="mt-4 w-full" disabled={!post.images.length || busy === "render"} onClick={render}>
              {busy === "render" ? "Rendering…" : post.renders.length ? "Render again" : "Render all formats"}
            </Button>
            <p className={cn(hint, "mt-2")}>
              1:1 1080×1080 · 4:5 1080×1350 · 9:16 1080×1920 · 1.91:1 1200×630, up to 4 images.
              Saved to the media library.
            </p>
            {post.images.filter((i) => rendersBy(i).length).map((image, n) => (
              <div key={image} className="mt-4">
                <p className="mb-2 text-xs font-medium text-neutral-600">Image {n + 1}</p>
                <div className="grid grid-cols-2 gap-3">
                  {rendersBy(image).map((r) => {
                    const f = FORMATS.find((x) => x.id === r.format)!;
                    return (
                      <div key={r.mediaId} className="grid gap-1.5">
                        <img
                          src={r.url}
                          alt={`${f.label} render`}
                          className="max-h-44 w-full rounded bg-neutral-100 object-contain"
                        />
                        <a
                          href={r.url}
                          download={`${post.name.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40)}-${f.label.replace(":", "x")}.webp`}
                          className="inline-flex items-center gap-1.5 text-xs text-neutral-700 hover:underline"
                        >
                          <Download className="size-3.5" /> {f.label} · {r.width}×{r.height}
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          {/* Publish */}
          <section className={section}>
            <h2 className={heading}>Publish</h2>
            <div className="mt-4 grid gap-4">
              {post.networks.map((n) => {
                const status = connection(n);
                const result = post.results[n];
                const format = FORMATS.find((f) => f.id === NETWORK_FORMAT[n])!;
                return (
                  <div key={n} className="grid gap-2 rounded-lg bg-neutral-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{NETWORK_NAMES[n]}</span>
                      <span className="text-xs text-neutral-500">
                        {status?.connected
                          ? `Connected · ${status.account}`
                          : "Not connected — ask the administrator"}
                      </span>
                    </div>
                    {result && (
                      <p className={cn("text-xs break-all", result.status === "failed" ? "text-red-600" : "text-emerald-700")}>
                        {result.status === "failed"
                          ? `Failed ${formatDate(result.at)}: ${result.error}`
                          : `Published ${formatDate(result.at)}${result.manual ? " (by hand)" : ""}`}
                        {result.url && (
                          <>
                            {" · "}
                            <a href={result.url} target="_blank" rel="noreferrer" className="underline">
                              view
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={!status?.connected || !!busy}
                        title={status?.connected ? `Uses the ${format.label} images` : "Not connected"}
                        onClick={() =>
                          run("publish-" + n, { action: "publish", id: post.id, network: n })
                        }
                      >
                        {busy === "publish-" + n ? "Publishing…" : "Publish now"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copy(caption(n), "Caption")}>
                        <Copy /> Copy caption
                      </Button>
                      <a
                        href={NETWORK_LINKS[n]}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-white px-2.5 text-[0.8rem] font-medium shadow-[0_0_0_1px_rgb(0_0_0/0.1)] hover:bg-neutral-100"
                      >
                        <ExternalLink className="size-3.5" /> Open {NETWORK_NAMES[n]}
                      </a>
                      <Button size="sm" variant="ghost" onClick={() => setMarkOpen(markOpen === n ? "" : n)}>
                        Mark as published
                      </Button>
                    </div>
                    {!status?.connected && (
                      <p className={hint}>
                        By hand: copy the caption, download the {format.label} images above, post
                        them in {NETWORK_NAMES[n]}, then mark the post as published with its link.
                      </p>
                    )}
                    {markOpen === n && (
                      <form
                        className="flex flex-col gap-2 sm:flex-row"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const done = await run(
                            "mark",
                            { action: "mark-published", id: post.id, network: n, url: markUrl[n] || "" },
                            `Marked as published on ${NETWORK_NAMES[n]}.`,
                          );
                          if (done) setMarkOpen("");
                        }}
                      >
                        <Input
                          type="url"
                          placeholder="https://… link to the post (optional)"
                          value={markUrl[n] || ""}
                          onChange={(e) => setMarkUrl({ ...markUrl, [n]: e.target.value })}
                        />
                        <Button size="sm" type="submit" className="h-9" disabled={busy === "mark"}>
                          Save
                        </Button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-5 grid gap-2">
              <span className="text-sm font-medium">Schedule</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="datetime-local"
                  aria-label="Publish at"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
                <Button
                  variant="outline"
                  className="h-9"
                  disabled={!when || !!busy}
                  onClick={() =>
                    run(
                      "schedule",
                      { action: "schedule", id: post.id, at: new Date(when).toISOString() },
                      "Scheduled.",
                    )
                  }
                >
                  Schedule
                </Button>
                {post.scheduledAt && (
                  <Button
                    variant="ghost"
                    className="h-9"
                    disabled={!!busy}
                    onClick={async () => {
                      const done = await run("schedule", { action: "schedule", id: post.id, at: null }, "Schedule removed.");
                      if (done) setWhen("");
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className={hint}>
                {post.scheduledAt ? `Scheduled for ${formatDate(post.scheduledAt)}. ` : ""}
                Scheduled posts go out automatically only on connected networks; otherwise the
                post waits for you to publish it by hand.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FocalPicker({
  url,
  focal,
  onPick,
}: {
  url: string;
  focal: { x: number; y: number };
  onPick: (focal: { x: number; y: number }) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Set the focal point"
      className="relative mx-auto mt-4 block w-fit max-w-full cursor-crosshair overflow-hidden rounded-lg bg-neutral-100"
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const round = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 1000) / 1000;
        onPick({
          x: round((e.clientX - box.left) / box.width),
          y: round((e.clientY - box.top) / box.height),
        });
      }}
    >
      <img src={url} alt="" className="block max-h-[420px] max-w-full" />
      <span
        aria-hidden
        className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/30 shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
        style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
      />
    </button>
  );
}
