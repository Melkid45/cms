"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { definitions } from "@/lib/builder/catalog";
import { PageHeader } from "@/components/admin/page-header";
import { Input } from "@/components/ui/input";
export default function Content() {
  const [query, setQuery] = useState("");
  return (
    <div>
      <PageHeader
        title="Section library"
        description="Every approved variation, rendered in Next.js with your shared SCSS. Add sections from the page editor."
      />
      <Input
        placeholder="Search sections and layouts"
        aria-label="Search section library"
        className="mb-6 max-w-sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {definitions
          .filter((d) =>
            `${d.title} ${d.label}`.toLowerCase().includes(query.toLowerCase()),
          )
          .map((d) => (
            <a
              href={`/library/${d.id}`}
              target="_blank"
              rel="noreferrer"
              key={d.id}
              className="overflow-hidden rounded-xl border bg-white transition hover:border-black"
            >
              <img
                src={d.thumbnail}
                alt={`${d.title} ${d.label}`}
                className="aspect-[16/10] w-full bg-neutral-100 object-contain"
                loading="lazy"
              />
              <div className="flex items-center justify-between border-t p-4">
                <div>
                  <p className="text-sm font-medium">
                    {d.title} · {d.label}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">{d.id}</p>
                </div>
                <ExternalLink className="size-4" />
              </div>
            </a>
          ))}
      </div>
    </div>
  );
}
