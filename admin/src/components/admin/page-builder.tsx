"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createContent, getDefinition } from "@/lib/cms-library";
import { readSavedPages, savePage, storageSnapshot } from "@/lib/page-storage";
import { BlockContentEditor } from "./block-content-editor";
import { BlockThumbnail } from "./site-preview";
import { LivePreviewDialog } from "./live-preview-dialog";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Globe, Layers, LayoutTemplate, Plus, Save, Search, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { BlockFamily } from "@/lib/block-catalog";
import type { ExamplePage, PageBlock } from "@/lib/example-pages";
import { defaultPageSeo } from "@/lib/example-pages";
import { PageSeoFields } from "@/components/admin/page-seo";

function slugify(value: string) {
  const letters: Record<string, string> = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
  return [...value.toLowerCase()].map((letter) => letters[letter] ?? letter).join("").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const subscribeSavedPage = (listener: () => void) => { window.addEventListener("storage", listener); return () => window.removeEventListener("storage", listener); };
export function PageBuilder({ catalog, initialPage, pageSlug }: { catalog: BlockFamily[]; initialPage?: ExamplePage; pageSlug?: string }) {
  const raw = useSyncExternalStore(subscribeSavedPage, storageSnapshot, () => "");
  const saved = readSavedPages(raw).find((page) => page.slug === (pageSlug ?? initialPage?.slug));
  return <PageBuilderEditor key={`${pageSlug ?? initialPage?.slug ?? "new"}-${saved ? JSON.stringify(saved) : "initial"}`} catalog={catalog} initialPage={saved ?? initialPage} locallySaved={Boolean(saved)} />;
}

function PageBuilderEditor({ catalog, initialPage, locallySaved }: { catalog: BlockFamily[]; initialPage?: ExamplePage; locallySaved: boolean }) {
  const router = useRouter();
  const [readyOnly, setReadyOnly] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const visibleCatalog = readyOnly ? catalog.filter((item) => item.ready) : catalog;
  function persist() {
    try {
      const page: ExamplePage = { title, slug, blocks, locale, seo, status: "Draft", updated: "Saved locally" };
      savePage(page, initialPage?.slug);
      setSavedSnapshot(snapshot);
      setNotice("Draft saved in this browser. It will remain after refresh.");
      if (slug !== initialPage?.slug) router.replace(`/dashboard/pages/${slug}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save. Browser storage may be unavailable or full."); }
  }
  const [title, setTitle] = useState(initialPage?.title ?? "");
  const [slug, setSlug] = useState(initialPage?.slug ?? "");
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<BlockFamily | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>(initialPage?.blocks ?? []);
  const [locale, setLocale] = useState(initialPage?.locale ?? "en");
  const status = "Local draft";
  const [notice, setNotice] = useState(locallySaved ? "Loaded your locally saved draft." : "");
  const [seo, setSeo] = useState(initialPage?.seo ?? defaultPageSeo);
  const snapshot = JSON.stringify({ title, slug, blocks, locale, seo });
  const [savedSnapshot, setSavedSnapshot] = useState(initialPage ? JSON.stringify({ title: initialPage.title, slug: initialPage.slug, blocks: initialPage.blocks, locale: initialPage.locale, seo: initialPage.seo ?? defaultPageSeo }) : "");
  const isSaved = snapshot === savedSnapshot;

  function move(index: number, direction: number) {
    setBlocks((current) => { const next = [...current]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
    setNotice("");
  }

  return <div className="rise-in">
    <Link href="/dashboard/pages" className="mb-5 inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-black"><ArrowLeft className="size-3.5" /> Back to pages</Link>
    <PageHeader title={initialPage ? `Edit ${initialPage.title}` : "Create a page"} description="Give your page a home, then build it one section at a time." action={<div className="flex items-center gap-3"><Badge variant="outline">{isSaved ? locallySaved ? "Saved locally" : "Example content" : "Unsaved changes"}</Badge><LivePreviewDialog blocks={blocks} /></div>} />
    <form onSubmit={(event) => { event.preventDefault(); persist(); }} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-6">
        <Card><CardHeader><CardTitle>Page details</CardTitle><p className="text-xs text-neutral-500">The name is for your visitors. The slug defines the page URL.</p></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="page-title">Page name <span className="text-neutral-400">*</span></Label><Input id="page-title" placeholder="e.g. About our studio" value={title} onChange={(event) => { setTitle(event.target.value); setNotice(""); }} required pattern=".*\S.*" maxLength={100} /></div>
          <div className="space-y-2"><Label htmlFor="page-slug">Slug <span className="text-neutral-400">*</span></Label><div className="relative"><Input id="page-slug" className="pr-10 font-mono" placeholder="about-our-studio" value={slug} onChange={(event) => { setSlug(event.target.value); setNotice(""); }} required pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Use lowercase letters, numbers and single hyphens." /><Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2" aria-label="Generate slug from page name" title="Generate from page name" disabled={!title.trim()} onClick={() => setSlug(slugify(title))}><Sparkles className="size-3.5" /></Button></div><p className="truncate text-xs text-neutral-400">/{locale}/{slug || "your-page"}</p></div>
        </CardContent></Card>

        <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Page sections</CardTitle><p className="mt-1 text-xs text-neutral-500">Sections appear on your website in this order.</p></div><Badge variant="secondary">{blocks.length} blocks</Badge></CardHeader><CardContent>
          {blocks.length === 0 ? <div className="flex flex-col items-center rounded-lg border border-dashed bg-neutral-50/50 px-6 py-10 text-center"><Layers className="mb-3 size-6 text-neutral-400" /><p className="font-medium">Your page starts here</p><p className="mt-1 text-xs text-neutral-500">Choose a block below to add your first section.</p></div> : <ol className="space-y-2">{blocks.map((block, index) => <li key={block.key} className="overflow-hidden rounded-lg border"><div className="flex items-center gap-3 p-3"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-neutral-100 text-xs text-neutral-500">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{block.family}</p><p className="truncate text-xs text-neutral-500">{block.variant} · {getDefinition(block.source) ? "Tailwind · editable" : "Legacy · structure only"}</p></div>{block.content && <Button type="button" variant={editingKey === block.key ? "secondary" : "outline"} size="sm" onClick={() => setEditingKey(editingKey === block.key ? null : block.key)}>{editingKey === block.key ? "Close" : "Edit content"}</Button>}<Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} aria-label={`Move section ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon-sm" disabled={index === blocks.length - 1} aria-label={`Move section ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove section ${index + 1}`} onClick={() => { setBlocks((current) => current.filter((item) => item.key !== block.key)); setNotice(""); }}><Trash2 /></Button></div>{block.content && editingKey === block.key && <><div className="flex items-center gap-3 border-t px-5 py-3"><Label htmlFor={`layout-${block.key}`}>Layout</Label><Select id={`layout-${block.key}`} className="h-9 flex-1" value={block.source} onValueChange={(selectedValue) => { const source = selectedValue; const definition = getDefinition(source)!; setBlocks((current) => current.map((item) => item.key === block.key ? { ...item, source, variant: definition.label } : item)); }}>{catalog.filter((item) => item.ready && item.variants.some((variant) => getDefinition(variant.source)?.family === getDefinition(block.source)?.family)).flatMap((item) => item.variants).map((variant) => <SelectOption key={variant.id} value={variant.source}>{variant.label}</SelectOption>)}</Select></div><BlockContentEditor id={block.key} source={block.source} value={block.content} onChange={(content) => { setBlocks((current) => current.map((item) => item.key === block.key ? { ...item, content } : item)); setNotice(""); }} /></>}</li>)}</ol>}
        </CardContent></Card>

        <Card><CardHeader><div className="flex items-center gap-2 text-xs text-neutral-400"><span className={!family ? "text-black" : ""}>01 · Block type</span><ChevronRight className="size-3" /><span className={family ? "text-black" : ""}>02 · Variation</span></div><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{family ? `Choose a ${family.label.toLowerCase()} variation` : "Block library"}</CardTitle><Button type="button" size="sm" variant="outline" onClick={() => { setReadyOnly(!readyOnly); setFamily(null); }}>{readyOnly ? "Show legacy layouts" : "Editable blocks only"}</Button></div><p className="text-xs text-neutral-500">{family ? "Select a layout to add it to your page." : "Reusable sections from your frontend component library."}</p></CardHeader><CardContent>
          {family ? <><Button type="button" variant="ghost" size="sm" className="mb-4" onClick={() => setFamily(null)}><ArrowLeft /> All block types</Button><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{family.variants.map((variant) => <button type="button" key={variant.id} onClick={() => { setBlocks((current) => [...current, { key: crypto.randomUUID(), family: family.label, variant: variant.label, source: variant.source, content: createContent(variant.source) }]); setNotice(""); }} className="group overflow-hidden rounded-lg border text-left transition hover:border-black focus-visible:outline-2 focus-visible:outline-offset-2"><BlockThumbnail source={variant.source} /><div className="flex items-center justify-between p-3"><div><p className="text-sm font-medium">{variant.label}</p><p className="mt-1 text-[10px] text-neutral-400">{getDefinition(variant.source)?.description ?? variant.id}</p></div><Plus className="size-4 text-neutral-400 group-hover:text-black" /></div></button>)}</div><p className="mt-3 text-xs text-neutral-400">New Tailwind layouts share the same content fields. You can switch layouts later without losing text.</p></> : <><div className="relative mb-4"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" /><Input aria-label="Search block types" placeholder="Search blocks..." className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleCatalog.filter((item) => `${item.label} ${item.id}`.toLowerCase().includes(query.toLowerCase())).map((item) => <button key={item.id} type="button" onClick={() => setFamily(item)} className="group flex items-start gap-3 rounded-lg border p-4 text-left transition hover:border-black hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2"><span className="grid size-9 shrink-0 place-items-center rounded-md border bg-neutral-50"><LayoutTemplate className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="mt-1 block text-xs text-neutral-400">{item.variants.length} {item.variants.length === 1 ? "variation" : "variations"} · {item.ready ? "Editable" : "Legacy"}</span></span><ChevronRight className="mt-1 size-3.5 text-neutral-400" /></button>)}</div>{!visibleCatalog.some((item) => `${item.label} ${item.id}`.toLowerCase().includes(query.toLowerCase())) && <p className="py-8 text-center text-sm text-neutral-500">No blocks match your search.</p>}</>}
        </CardContent></Card>
        <PageSeoFields value={seo} onChange={(value) => { setSeo(value); setNotice(""); }} pageTitle={title} slug={slug} locale={locale} />
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24">
        <Card><CardHeader><CardTitle>Publishing</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between text-xs"><span className="text-neutral-500">Status</span><Badge variant="outline">{status}</Badge></div><Button className="w-full" type="submit"><Save /> Save draft</Button><Button className="w-full" variant="outline" type="button" disabled={!isSaved || !blocks.length} onClick={() => window.open(`/preview/${slug}`, "_blank", "noopener,noreferrer")}><Check /> Open saved preview</Button><p className="text-xs leading-relaxed text-neutral-400">Local drafts only. No database or public publishing yet. Save before opening the full-page preview.</p><p role="status" className="text-xs leading-relaxed">{notice}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Globe className="size-4" /> Localization</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="page-locale">Page language</Label><Select id="page-locale" value={locale} onValueChange={(selectedValue) => { setLocale(selectedValue); setNotice(""); }} className="h-9"><SelectOption value="en">English (en)</SelectOption><SelectOption value="ru">Russian (ru)</SelectOption><SelectOption value="de">German (de)</SelectOption></Select><p className="text-xs leading-relaxed text-neutral-400">Language metadata only for now. Separate translated versions are not connected.</p></CardContent></Card>
        <div className="px-1 text-xs leading-relaxed text-neutral-400">Page structure<br /><span className="text-neutral-600">{blocks.length} sections · {locale.toUpperCase()}</span></div>
      </aside>
    </form>
  </div>;
}
