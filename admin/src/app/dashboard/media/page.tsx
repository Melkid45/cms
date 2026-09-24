"use client";

import { useRef, useState } from "react";
import { FileImage, Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const files = ["hero-studio.jpg", "project-atelier.jpg", "portrait-team.jpg", "showreel-cover.jpg", "texture-paper.png", "logo-mark.svg"];

export default function MediaPage() {
  const picker = useRef<HTMLInputElement>(null);
  const [uploaded, setUploaded] = useState<string[]>([]);

  return (
    <div className="rise-in">
      <PageHeader title="Media library" description="Images, videos, and documents used in your project." action={<><input ref={picker} type="file" multiple className="hidden" onChange={(event) => setUploaded((current) => [...Array.from(event.target.files ?? []).map((file) => file.name), ...current])} /><Button onClick={() => picker.current?.click()}><Upload data-icon="inline-start" /> Upload</Button></>} />
      <Card className="mb-5 flex items-center justify-between border-dashed p-5 shadow-none"><div><p className="text-sm font-medium">Drop files here</p><p className="mt-1 text-xs text-neutral-400">PNG, JPG, SVG, MP4, or PDF up to 25 MB</p></div><button onClick={() => picker.current?.click()} className="grid size-9 place-items-center rounded-md border hover:bg-neutral-50" aria-label="Select files"><Plus className="size-4" /></button></Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {[...uploaded, ...files].map((file, index) => (
          <button key={`${file}-${index}`} className="group overflow-hidden rounded-lg border bg-white text-left hover:border-black">
            <span className="grid aspect-[4/3] place-items-center bg-neutral-100"><FileImage className="size-8 text-neutral-300 transition-transform group-hover:scale-105" strokeWidth={1.4} /></span>
            <span className="block truncate border-t px-3 py-2.5 text-xs font-medium">{file}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
