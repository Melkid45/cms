"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { File, MoreHorizontal, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { allPages, storageSnapshot, subscribePages } from "@/lib/page-storage";


export default function PagesPage() {
  const [query, setQuery] = useState("");
  const raw = useSyncExternalStore(subscribePages, storageSnapshot, () => "");
  const pages = useMemo(() => allPages(raw), [raw]);
  const visiblePages = useMemo(() => pages.filter((page) => page.title.toLowerCase().includes(query.toLowerCase()) || page.slug.includes(query)), [pages, query]);


  return (
    <div className="rise-in">
      <PageHeader title="Pages" description="Manage your site structure and build pages from reusable sections." action={<Button nativeButton={false} render={<Link href="/dashboard/pages/new" />}><Plus data-icon="inline-start" /> New page</Button>} />
      <Card className="overflow-hidden shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages..." className="pl-9" /></div>
          <p className="text-xs text-neutral-400">{visiblePages.length} of {pages.length} pages</p>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead className="pl-5">Page</TableHead><TableHead>Sections</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {visiblePages.map((page) => (
              <TableRow key={page.slug}>
                <TableCell className="py-4 pl-5">
                  <Link href={`/dashboard/pages/${page.slug.replace(/^\//, "")}`} className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-md border bg-neutral-50">
                      <File className="size-4" />
                    </span>
                    <span>
                      <span className="block font-medium">
                        {page.title}
                      </span>
                      <span className="block font-mono text-[11px] text-neutral-400">
                        /{page.slug}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-neutral-500">{page.blocks.length}</TableCell>
                <TableCell><Badge variant="outline" className="font-normal"><span className="mr-1 size-1.5 rounded-full bg-black" />{page.status}</Badge></TableCell>
                <TableCell className="text-neutral-500">{page.updated}</TableCell>
                <TableCell><button className="grid size-8 place-items-center rounded hover:bg-neutral-100" aria-label={`Actions: ${page.title}`}><MoreHorizontal className="size-4" /></button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
