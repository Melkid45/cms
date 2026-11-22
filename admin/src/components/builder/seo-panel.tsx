"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { pageHref } from "@/lib/builder/i18n";
import { withSite } from "@/lib/builder/site-client";
import { pageContent } from "@/lib/builder/seo/content";
import { LIMITS } from "@/lib/builder/seo/audit";
import type { CmsPage, Project } from "@/lib/builder/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaPicker } from "./media-picker";

type Seo = CmsPage["seo"];
export interface CheckView {
  id: string;
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
  fix?: { href: string; label: string };
}
export interface PageReport {
  pageId: string;
  score: number;
  issues: number;
  checks: CheckView[];
  ai: { score: number; checks: CheckView[] } | null;
}
const tone = {
  ok: "bg-emerald-500",
  warn: "bg-amber-400",
  error: "bg-red-500",
};
export function scoreColor(score: number) {
  return score >= 85 ? "text-emerald-700" : score >= 60 ? "text-amber-700" : "text-red-700";
}
export function CheckList({ checks, locked }: { checks: CheckView[]; locked?: boolean }) {
  return (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${tone[c.status]}`} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{c.label}</span>
            <span className="sr-only"> ({c.status})</span>
            {c.detail && <span className="block text-xs leading-5 text-neutral-500">{c.detail}</span>}
            {locked && c.status !== "ok" && (
              <span className="block text-xs text-neutral-400">Details with the SEO pack</span>
            )}
          </span>
          {c.fix && (
            <Link href={c.fix.href} className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">
              {c.fix.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
function Counter({ value, min, max }: { value: number; min?: number; max: number }) {
  const bad = value > max || (min !== undefined && value > 0 && value < min);
  return (
    <span className={`text-xs tabular-nums ${bad ? "text-amber-700" : "text-neutral-400"}`}>
      {value}
      {min !== undefined ? ` / ${min}–${max}` : ` / ${max}`}
    </span>
  );
}
const cut = (value: string, max: number) =>
  value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value;

// Page editor → "Search & sharing": SEO fields with live Google and social previews,
// length counters and the page check from /api/builder/seo (details with the SEO pack).
export function SeoPanel({
  page,
  project,
  siteKey,
  onChange,
}: {
  page: CmsPage;
  project: Project;
  siteKey?: string;
  onChange: (seo: Seo) => void;
}) {
  const seo = page.seo;
  const set = (patch: Partial<Seo>) => onChange({ ...seo, ...patch });
  const title = seo.title || page.title;
  const description = seo.description;
  // The editor renders only in the browser (after the project loads).
  const origin = project.website?.url || (typeof window !== "undefined" ? window.location.origin : "");
  const path = pageHref(project, siteKey, { slug: page.slug || "page", locale: page.locale });
  const url = (origin || "") + path;
  const hero = pageContent(page.sections).heroImage;
  const cardImage = seo.image || hero;
  const host = origin.replace(/^https?:\/\//, "");

  const [report, setReport] = useState<PageReport | null>(null);
  const [pack, setPack] = useState(false);
  const [checking, setChecking] = useState(false);
  const saved = !!page.updatedAt;
  const fetchReport = useCallback(
    () =>
      fetch(withSite(`/api/builder/seo?page=${encodeURIComponent(page.id)}`), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          setPack(!!data.pack);
          setReport(data.pages[0] ?? null);
        })
        .catch(() => {}),
    [page.id],
  );
  const check = () => {
    setChecking(true);
    void fetchReport().finally(() => setChecking(false));
  };
  useEffect(() => {
    if (saved) void fetchReport();
  }, [saved, fetchReport]);

  // Fix links (#seo-title …) from the SEO overview: scroll to the field and focus it.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id.startsWith("seo-")) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus();
  }, []);

  return (
    <Card id="seo-panel">
      <CardHeader>
        <CardTitle>Search & sharing</CardTitle>
        <p className="text-xs text-neutral-500">
          Per page and per language: each translation has its own texts.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="seo-title">SEO title</Label>
                <Counter value={seo.title.length} min={LIMITS.title.min} max={LIMITS.title.max} />
              </div>
              <Input id="seo-title" value={seo.title} maxLength={300} placeholder={page.title} onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="seo-description">Meta description</Label>
                <Counter value={description.length} min={LIMITS.description.min} max={LIMITS.description.max} />
              </div>
              <Textarea id="seo-description" value={description} maxLength={1000} rows={3} onChange={(e) => set({ description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seo-keywords">Keywords</Label>
              <Input id="seo-keywords" value={seo.keywords} maxLength={1000} onChange={(e) => set({ keywords: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-500">Google preview</p>
            <div className="rounded-xl bg-white p-4 shadow-sm" aria-label="Google search result preview">
              <p className="truncate text-xs text-neutral-600">
                {host} {path.split("/").filter(Boolean).map((part) => `› ${part}`).join(" ")}
              </p>
              <p className="mt-1 text-lg leading-6 text-[#1a0dab]">{cut(title || "Page title", 62)}</p>
              <p className="mt-1 text-sm leading-5 text-neutral-600">
                {description ? cut(description, 160) : <span className="italic text-neutral-400">No description: Google picks a text from the page.</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="seo-og-title">Social title</Label>
                <Counter value={(seo.ogTitle || "").length} max={LIMITS.ogTitle} />
              </div>
              <Input id="seo-og-title" value={seo.ogTitle || ""} maxLength={300} placeholder={title} onChange={(e) => set({ ogTitle: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="seo-og-description">Social description</Label>
                <Counter value={(seo.ogDescription || "").length} max={LIMITS.ogDescription} />
              </div>
              <Textarea id="seo-og-description" value={seo.ogDescription || ""} maxLength={1000} rows={2} placeholder={description} onChange={(e) => set({ ogDescription: e.target.value })} />
            </div>
            <div className="space-y-2" id="seo-image">
              <Label>Social image (1200×630)</Label>
              <MediaPicker value={seo.image} onChange={(image) => set({ image })} />
              {!seo.image && (
                <p className="text-xs text-neutral-500">
                  {pack
                    ? "Empty: an image is made automatically from the hero picture and the title."
                    : hero
                      ? "Empty: the page's first picture is shared."
                      : "Empty: shared without a picture."}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-500">Social card preview</p>
            <div className="overflow-hidden rounded-xl bg-white shadow-sm" aria-label="Social card preview">
              <div className="relative aspect-[1.91/1] bg-neutral-100">
                {cardImage ? (
                  <img src={cardImage} alt="" className="size-full object-cover" />
                ) : null}
                {!seo.image && pack && (
                  <div className="absolute inset-0 flex items-end bg-gradient-to-b from-transparent to-black/70 p-5">
                    <p className="line-clamp-3 text-xl font-semibold text-white">{seo.ogTitle || title}</p>
                  </div>
                )}
              </div>
              <div className="space-y-1 bg-neutral-50 p-3">
                <p className="text-[11px] text-neutral-500">{host}</p>
                <p className="line-clamp-1 text-sm font-semibold">{seo.ogTitle || title || "Page title"}</p>
                <p className="line-clamp-2 text-xs text-neutral-600">{seo.ogDescription || description}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="seo-canonical">Canonical URL (optional)</Label>
            <Input id="seo-canonical" type="url" value={seo.canonical || ""} placeholder={url} onChange={(e) => set({ canonical: e.target.value.trim() })} />
            <p className="text-xs text-neutral-500">Only when this page duplicates another address. Empty = this page.</p>
          </div>
          <label className="flex items-center gap-2 self-center text-sm">
            <input id="seo-noindex" type="checkbox" checked={seo.noindex} onChange={(e) => set({ noindex: e.target.checked })} />
            Hide from search engines (noindex, left out of the sitemap)
          </label>
        </div>

        <div className="space-y-3 rounded-xl bg-neutral-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              Page check{" "}
              {report && <span className={`tabular-nums ${scoreColor(report.score)}`}>{report.score}/100</span>}
              {report?.ai && (
                <span className={`ml-3 tabular-nums ${scoreColor(report.ai.score)}`}>AI readiness {report.ai.score}/100</span>
              )}
            </p>
            <Button type="button" size="sm" variant="ghost" disabled={!saved || checking} onClick={() => void check()}>
              <RefreshCw className={checking ? "animate-spin" : ""} />
              Re-check
            </Button>
          </div>
          {!saved && <p className="text-xs text-neutral-500">Save the page to check it.</p>}
          {report && (
            <>
              <p className="text-xs text-neutral-500">Checks the published version (or the saved draft of an unpublished page).</p>
              <CheckList checks={report.checks} locked={!pack} />
              {report.ai && (
                <>
                  <p className="pt-2 text-sm font-medium">AI search readiness</p>
                  <CheckList checks={report.ai.checks} />
                </>
              )}
              {!pack && (
                <p className="text-xs text-neutral-500">
                  Fix links, AI readiness checks and automatic share images come with the SEO pack.
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
