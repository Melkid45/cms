"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Plus, Save, Trash2, Wand2 } from "lucide-react";
import { useProject } from "@/lib/builder/client";
import { withSite } from "@/lib/builder/site-client";
import { BUSINESS_TYPES } from "@/lib/builder/seo/jsonld";
import type { RedirectSuggestion } from "@/lib/builder/seo/suggest";
import type { SeoBusiness, SiteSeo } from "@/lib/builder/types";
import { CheckList, scoreColor, type CheckView, type PageReport } from "@/components/builder/seo-panel";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectOption } from "@/components/ui/select";

interface Overview {
  site: { id: string; key: string; name: string };
  pack: boolean;
  canTogglePack: boolean;
  score: number;
  entity: CheckView[] | null;
  bots: { answer: { token: string; owner: string; use: string }[]; training: { token: string; owner: string; use: string }[] };
  pages: (PageReport & { title: string; slug: string; locale: string; published: boolean; noindex: boolean })[];
}
const emptyBusiness = (): SeoBusiness => ({
  type: "LocalBusiness",
  name: "",
  legalName: "",
  description: "",
  street: "",
  city: "",
  region: "",
  postalCode: "",
  country: "LV",
  phone: "",
  email: "",
  hours: "",
  lat: "",
  lng: "",
  logo: "",
  priceRange: "",
  sameAs: "",
});
const newId = () => crypto.randomUUID();

// Dashboard → SEO: website score, page checks with fix links, AI readiness, business data
// for structured data, verification tags, indexing / AI crawler policy and redirects.
export function SeoDashboard() {
  const { project, error: loadError, save } = useProject();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<SiteSeo | null>(null);
  const [open, setOpen] = useState("");
  const [busy, setBusy] = useState(false);
  const [oldUrls, setOldUrls] = useState("");
  const [suggestions, setSuggestions] = useState<(RedirectSuggestion & { use: boolean })[]>([]);
  const load = useCallback(
    () =>
      fetch(withSite("/api/builder/seo"), { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) setError(body.error || "Could not load the SEO overview.");
          else setData(body);
        })
        .catch(() => setError("Could not load the SEO overview.")),
    [],
  );
  useEffect(() => {
    void load();
  }, [load, project?.revision]);
  useEffect(() => {
    if (!data) return;
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [data]);
  if (!project || !data)
    return <p className="text-sm text-neutral-500">{loadError || error || "Loading…"}</p>;

  const seo: SiteSeo = draft ?? project.seo ?? {};
  const business = seo.business ?? {
    ...emptyBusiness(),
    name: project.brand.name,
    phone: project.website?.phone || "",
    email: project.website?.contactEmail || "",
    street: project.website?.address || "",
  };
  const edit = (patch: Partial<SiteSeo>) => {
    setDraft({ ...seo, ...patch });
    setNotice("");
  };
  const setBusiness = (patch: Partial<SeoBusiness>) => edit({ business: { ...business, ...patch } });
  const redirects = seo.redirects ?? [];
  const pages = project.pages.filter((p) => !p.deletedAt);
  const pageTitle = (id: string) => pages.find((p) => p.id === id)?.title;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!project || !draft) return;
    setBusy(true);
    setError("");
    try {
      await save({ ...project, seo: draft });
      setDraft(null);
      setNotice("SEO settings saved. They are live on the public website.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function togglePack(enabled: boolean) {
    const response = await fetch(withSite("/api/builder/seo"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pack", enabled }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error);
    else await load();
  }
  async function suggest() {
    setError("");
    const response = await fetch(withSite("/api/builder/seo"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest", urls: oldUrls.split(/\s+/).filter(Boolean).slice(0, 1000) }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error);
    else setSuggestions(body.suggestions.map((s: RedirectSuggestion) => ({ ...s, use: !!s.to })));
  }
  const base = `/site/${data.site.key}`;
  const sorted = [...data.pages].sort((a, b) => a.score - b.score);
  const withIssues = sorted.filter((p) => p.issues > 0).length;

  return (
    <AdminPanel
      title="SEO"
      className="w-full space-y-6"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          // AI SEO assistant (SEO pack): suggestions with an approval queue.
          <Link href="/dashboard/seo/assistant" className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800">
            <Wand2 className="size-4" /> AI SEO assistant
          </Link>
        }</div>}
    >
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-1 pt-6">
            <p className="text-sm text-neutral-500">Website score</p>
            <p className={`text-4xl font-semibold tabular-nums ${scoreColor(data.score)}`}>{data.score}</p>
            <p className="text-xs text-neutral-500">
              {data.pages.length} pages, {withIssues} with issues
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-6 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                SEO pack: {data.pack ? <span className="text-emerald-700">on</span> : <span className="text-neutral-500">off</span>}
              </p>
              <p className="text-xs leading-5 text-neutral-500">
                Basic meta fields, sitemap, robots.txt and structured data work on every website. The pack adds check
                details with fix links, AI search readiness, automatic share images, llms.txt and redirect suggestions.
              </p>
            </div>
            {data.canTogglePack && (
              <Button type="button" size="sm" variant={data.pack ? "outline" : "default"} onClick={() => void togglePack(!data.pack)}>
                {data.pack ? "Switch pack off" : "Switch pack on"}
              </Button>
            )}
            <div className="flex w-full flex-wrap gap-4 text-xs">
              {["sitemap.xml", "robots.txt", ...(data.pack ? ["llms.txt", "llms-full.txt"] : [])].map((file) => (
                <a key={file} href={`${base}/${file}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                  <ExternalLink className="size-3.5" />
                  {file}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pages</CardTitle>
          <p className="text-xs text-neutral-500">Worst first. Published pages are checked as published.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {sorted.map((p) => (
            <div key={p.pageId} className="rounded-xl bg-neutral-50">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left"
                aria-expanded={open === p.pageId}
                onClick={() => setOpen(open === p.pageId ? "" : p.pageId)}
              >
                <span className={`w-10 text-lg font-semibold tabular-nums ${scoreColor(p.score)}`}>{p.score}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.title}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {p.locale} · /{p.slug} · {p.published ? "published" : "draft"}
                    {p.noindex ? " · noindex" : ""}
                  </span>
                </span>
                {p.ai && <span className={`text-xs tabular-nums ${scoreColor(p.ai.score)}`}>AI {p.ai.score}</span>}
                <span className="text-xs text-neutral-500">{p.issues ? `${p.issues} issues` : "no issues"}</span>
                <ChevronDown className={`size-4 transition-transform ${open === p.pageId ? "rotate-180" : ""}`} />
              </button>
              {open === p.pageId && (
                <div className="space-y-3 px-4 pb-4">
                  <CheckList checks={p.checks} locked={!data.pack} />
                  {p.ai && (
                    <>
                      <p className="text-sm font-medium">AI search readiness</p>
                      <CheckList checks={p.ai.checks} />
                    </>
                  )}
                  <Link href={`/dashboard/pages/${p.slug}#seo-panel`} className="inline-block text-xs font-medium underline-offset-2 hover:underline">
                    Open page SEO
                  </Link>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {data.entity && (
        <Card>
          <CardHeader>
            <CardTitle>AI search readiness of the website</CardTitle>
            <p className="text-xs text-neutral-500">ChatGPT search, Perplexity, Gemini and Google AI Overviews quote websites they can identify and read.</p>
          </CardHeader>
          <CardContent>
            <CheckList checks={data.entity} />
          </CardContent>
        </Card>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Card id="seo-indexing">
          <CardHeader>
            <CardTitle>Indexing and AI crawlers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={!!seo.hideSite} onChange={(e) => edit({ hideSite: e.target.checked })} />
              <span>
                Hide the whole website from search engines
                <span className="block text-xs text-neutral-500">For test websites and before launch: noindex on every page, robots.txt disallows it.</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={!!seo.blockAiTraining} onChange={(e) => edit({ blockAiTraining: e.target.checked })} />
              <span>
                Block AI crawlers that only collect training data
                <span className="block text-xs text-neutral-500">
                  Blocked: {data.bots.training.map((b) => b.token).join(", ")}. Always allowed (they bring visitors from AI answers):{" "}
                  {data.bots.answer.map((b) => b.token).join(", ")}. Google-Extended does not affect Google Search.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Search Console verification</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="seo-google">Google (content value of google-site-verification)</Label>
              <Input id="seo-google" value={seo.verification?.google || ""} onChange={(e) => edit({ verification: { ...seo.verification, google: e.target.value.trim() } })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seo-bing">Bing (content value of msvalidate.01)</Label>
              <Input id="seo-bing" value={seo.verification?.bing || ""} onChange={(e) => edit({ verification: { ...seo.verification, bing: e.target.value.trim() } })} />
            </div>
          </CardContent>
        </Card>

        <Card id="seo-business">
          <CardHeader>
            <CardTitle>Business details (structured data)</CardTitle>
            <p className="text-xs text-neutral-500">Published as Organization / LocalBusiness JSON-LD on every page.</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={business.type} onValueChange={(type) => setBusiness({ type })} aria-label="Business type">
                {BUSINESS_TYPES.map((t) => (
                  <SelectOption key={t} value={t}>
                    {t.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </SelectOption>
                ))}
              </Select>
            </div>
            {(
              [
                ["name", "Name"],
                ["legalName", "Legal name"],
                ["phone", "Phone"],
                ["email", "E-mail"],
                ["street", "Street address"],
                ["city", "City"],
                ["region", "Region"],
                ["postalCode", "Postal code"],
                ["country", "Country (ISO code, e.g. LV)"],
                ["priceRange", "Price range (e.g. €€)"],
                ["lat", "Latitude"],
                ["lng", "Longitude"],
                ["logo", "Logo URL (empty = website logo)"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`seo-b-${key}`}>{label}</Label>
                <Input id={`seo-b-${key}`} value={business[key]} onChange={(e) => setBusiness({ [key]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="seo-b-description">Short description</Label>
              <Textarea id="seo-b-description" rows={2} value={business.description} onChange={(e) => setBusiness({ description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seo-b-hours">Opening hours, one rule per line</Label>
              <Textarea id="seo-b-hours" rows={3} placeholder={"Mo-Fr 09:00-18:00\nSa 10:00-14:00"} value={business.hours} onChange={(e) => setBusiness({ hours: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seo-b-sameas">Profiles (Facebook, Instagram, Google Maps…), one https link per line</Label>
              <Textarea id="seo-b-sameas" rows={3} value={business.sameAs} onChange={(e) => setBusiness({ sameAs: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card id="seo-redirects">
          <CardHeader>
            <CardTitle>Redirects (301)</CardTitle>
            <p className="text-xs text-neutral-500">
              Old addresses → pages of this website. Paths are relative to the website: today {base}/…, later the client&apos;s own domain.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {redirects.map((r, index) => (
              <div key={r.id} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Input aria-label="Old path" value={r.from} placeholder="/old/address" onChange={(e) => edit({ redirects: redirects.map((x, i) => (i === index ? { ...x, from: e.target.value } : x)) })} />
                <Select value={pageTitle(r.to) ? r.to : "custom"} onValueChange={(to) => edit({ redirects: redirects.map((x, i) => (i === index ? { ...x, to: to === "custom" ? "/" : to } : x)) })} aria-label="Target page">
                  {[
                    ...pages.map((p) => (
                      <SelectOption key={p.id} value={p.id}>
                        {p.title} ({p.locale})
                      </SelectOption>
                    )),
                    <SelectOption key="custom" value="custom">
                      Other address…
                    </SelectOption>,
                  ]}
                </Select>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove redirect" onClick={() => edit({ redirects: redirects.filter((_, i) => i !== index) })}>
                  <Trash2 />
                </Button>
                {!pageTitle(r.to) && (
                  <Input className="sm:col-span-2" aria-label="Target address" value={r.to} placeholder="/path or https://…" onChange={(e) => edit({ redirects: redirects.map((x, i) => (i === index ? { ...x, to: e.target.value } : x)) })} />
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => edit({ redirects: [...redirects, { id: newId(), from: "", to: pages[0]?.id || "/" }] })}>
              <Plus />
              Add redirect
            </Button>
            {data.pack ? (
              <div className="space-y-2 rounded-xl bg-neutral-50 p-4">
                <Label htmlFor="seo-old-urls">Suggest from the old website&apos;s addresses (one per line)</Label>
                <Textarea id="seo-old-urls" rows={4} value={oldUrls} onChange={(e) => setOldUrls(e.target.value)} placeholder={"https://old-site.lv/lv/par-mums/\nhttps://old-site.lv/ru/o-nas/"} />
                <Button type="button" size="sm" variant="outline" disabled={!oldUrls.trim()} onClick={() => void suggest()}>
                  <Wand2 />
                  Suggest redirects
                </Button>
                {!!suggestions.length && (
                  <div className="space-y-1 text-sm">
                    {suggestions.map((s, i) => (
                      <label key={s.from} className="flex items-center gap-2">
                        <input type="checkbox" disabled={!s.to} checked={s.use} onChange={(e) => setSuggestions(suggestions.map((x, j) => (j === i ? { ...x, use: e.target.checked } : x)))} />
                        <span className="min-w-0 flex-1 truncate">
                          {s.from} → {s.to ? `${s.page}${s.confidence === "close" ? " (close match)" : ""}` : "no match, add by hand"}
                        </span>
                      </label>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const add = suggestions.filter((s) => s.use && s.to).map((s) => ({ id: newId(), from: s.from, to: s.to }));
                        edit({ redirects: [...redirects, ...add] });
                        setSuggestions([]);
                      }}
                    >
                      Add selected
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">Suggestions from the old website&apos;s addresses come with the SEO pack.</p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={busy || !draft}>
            <Save />
            {busy ? "Saving…" : "Save SEO settings"}
          </Button>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          {notice && <p className="text-sm text-emerald-700" role="status">{notice}</p>}
        </div>
      </form>
    </AdminPanel>
  );
}
