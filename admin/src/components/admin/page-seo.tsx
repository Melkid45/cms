"use client";

import { Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { PageSeo } from "@/lib/example-pages";

export function PageSeoFields({ value, onChange, pageTitle, slug, locale }: { value: PageSeo; onChange: (value: PageSeo) => void; pageTitle: string; slug: string; locale: string }) {
  function update<K extends keyof PageSeo>(key: K, next: PageSeo[K]) { onChange({ ...value, [key]: next }); }
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Globe className="size-4" /> SEO & social sharing</CardTitle><p className="text-xs text-neutral-500">Control search appearance, indexing and link previews.</p></CardHeader><CardContent className="space-y-6">
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="seo-title">Meta title</Label><Input id="seo-title" value={value.title} onChange={(event) => update("title", event.target.value)} placeholder={pageTitle || "Page title"} /><p className="text-xs text-neutral-400">{value.title.length} characters · aim for around 50–60. Defaults to the page name.</p></div>
      <div className="space-y-2"><Label htmlFor="seo-keywords">Keywords</Label><Input id="seo-keywords" value={value.keywords} onChange={(event) => update("keywords", event.target.value)} placeholder="studio, design, architecture" /><p className="text-xs text-neutral-400">Optional, comma-separated.</p></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="seo-description">Meta description</Label><Textarea id="seo-description" value={value.description} onChange={(event) => update("description", event.target.value)} placeholder="A clear summary of what visitors will find on this page." /><p className="text-xs text-neutral-400">{value.description.length} characters · aim for around 140–160.</p></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="seo-canonical">Canonical URL</Label><Input id="seo-canonical" type="url" pattern="https?://.*" value={value.canonical} onChange={(event) => update("canonical", event.target.value)} placeholder="https://example.com/en/about" /><p className="text-xs text-neutral-400">Leave empty to use this page’s URL.</p></div>
    </div>
    <div className="rounded-lg border bg-neutral-50/50 p-4"><p className="mb-3 text-xs font-medium text-neutral-500">Search preview</p><p className="truncate text-xs text-neutral-500">{value.canonical || `example.com/${locale}/${slug || "your-page"}`}</p><p className="mt-1 break-words text-lg font-medium">{value.title || pageTitle || "Page title"}</p><p className="mt-1 break-words text-sm text-neutral-500">{value.description || "Your page description will appear here."}</p></div>
    <div className="space-y-4 border-t pt-5"><h3 className="text-sm font-medium">Open Graph</h3><p className="text-xs text-neutral-500">Used when your page is shared on social platforms. Empty titles and descriptions use the SEO fields.</p><div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="og-title">Social title</Label><Input id="og-title" value={value.ogTitle} onChange={(event) => update("ogTitle", event.target.value)} placeholder={value.title || pageTitle || "Use meta title"} /></div>
      <div className="space-y-2"><Label htmlFor="og-type">Content type</Label><Select id="og-type" className="" value={value.ogType} onValueChange={(selectedValue) => update("ogType", selectedValue as PageSeo["ogType"])}><SelectOption value="website">Website</SelectOption><SelectOption value="article">Article</SelectOption></Select></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="og-description">Social description</Label><Textarea id="og-description" value={value.ogDescription} onChange={(event) => update("ogDescription", event.target.value)} placeholder={value.description || "Use meta description"} /></div>
      <div className="space-y-2"><Label htmlFor="og-image">Social image (og:image)</Label><Input id="og-image" type="url" pattern="https?://.*" value={value.ogImage} onChange={(event) => update("ogImage", event.target.value)} placeholder="https://example.com/images/share.jpg" /><p className="text-xs text-neutral-400">Public image URL · recommended size 1200 × 630 px.</p></div>
      <div className="space-y-2"><Label htmlFor="og-image-alt">Image alternative text</Label><Input id="og-image-alt" value={value.ogImageAlt} onChange={(event) => update("ogImageAlt", event.target.value)} placeholder="Describe the sharing image" /></div>
    </div></div>
    <div className="space-y-4 border-t pt-5"><h3 className="text-sm font-medium">Search engine access</h3>{([{ key: "index", title: "Allow indexing", description: "Allow this page to appear in search results." }, { key: "follow", title: "Follow links", description: "Allow crawlers to follow links on this page." }] as const).map((item) => <div key={item.key} className="flex items-center justify-between gap-4"><div><Label htmlFor={`seo-${item.key}`}>{item.title}</Label><p className="mt-1 text-xs text-neutral-500">{item.description}</p></div><Switch id={`seo-${item.key}`} checked={value[item.key]} onCheckedChange={(checked) => update(item.key, checked)} /></div>)}<p className="text-xs text-neutral-400">Robots: {value.index ? "index" : "noindex"}, {value.follow ? "follow" : "nofollow"}</p></div>
  </CardContent></Card>;
}
