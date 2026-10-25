"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { allPages, storageSnapshot, subscribePages } from "@/lib/page-storage";
import { SitePreview } from "./site-preview";
export function SavedPagePreview({ slug }: { slug: string }) {
  const raw = useSyncExternalStore(subscribePages, storageSnapshot, () => "");
  const page = allPages(raw).find((item) => item.slug === slug);
  return <main className="min-h-screen bg-white"><div className="flex flex-wrap items-center justify-between gap-4 border-b bg-neutral-50 px-6 py-4 text-xs"><Link href={`/dashboard/pages/${slug}`}>← Back to editor</Link><span>Saved local preview · {page?.title ?? slug} · Not publicly published</span></div>{page ? <SitePreview blocks={page.blocks} /> : <p className="p-12 text-center">Save this page in the editor first. This preview is available only in the same browser.</p>}</main>;
}
