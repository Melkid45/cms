"use client";

import { useMemo, useState } from "react";
import { File, MoreHorizontal, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const initialPages = [
  { title: "Home", slug: "/", sections: 8, status: "Published", updated: "8 minutes ago" },
  { title: "About", slug: "/about", sections: 5, status: "Published", updated: "September 17" },
  { title: "Services", slug: "/services", sections: 7, status: "Published", updated: "September 15" },
  { title: "Projects", slug: "/projects", sections: 4, status: "Draft", updated: "Today, 10:18" },
  { title: "Contacts", slug: "/contacts", sections: 3, status: "Published", updated: "September 2" },
];

export default function PagesPage() {
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState(initialPages);
  const visiblePages = useMemo(() => pages.filter((page) => page.title.toLowerCase().includes(query.toLowerCase()) || page.slug.includes(query)), [pages, query]);

  function addPage() {
    setPages((current) => [{ title: "New page", slug: `/new-page-${current.length + 1}`, sections: 0, status: "Draft", updated: "Just now" }, ...current]);
  }

  return (
    <div className="rise-in">
      <PageHeader title="Pages" description="Manage your site structure and build pages from reusable sections." action={<Button onClick={addPage}><Plus data-icon="inline-start" /> New page</Button>} />
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
                <TableCell className="py-4 pl-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-md border bg-neutral-50"><File className="size-4" /></span><span><span className="block font-medium">{page.title}</span><span className="block font-mono text-[11px] text-neutral-400">{page.slug}</span></span></div></TableCell>
                <TableCell className="text-neutral-500">{page.sections}</TableCell>
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
