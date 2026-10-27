"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { useProject, uploadMedia } from "@/lib/builder/client";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function MediaPage() {
  const { project, error, save } = useProject(),
    input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState("");
  const asset = project?.media.find((m) => m.id === selected);
  return (
    <div>
      <PageHeader
        title="Media library"
        description="Upload once. Reuse images in any section, logo or sharing image."
        action={
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml"
              className="hidden"
              onChange={async (e) => {
                setBusy(true);
                try {
                  let count = 0;
                  for (const file of Array.from(e.target.files || [])) {
                    await uploadMedia(file);
                    count++;
                  }
                  setNotice(
                    `${count} image${count === 1 ? "" : "s"} uploaded and saved.`,
                  );
                } catch (error) {
                  setNotice(
                    error instanceof Error ? error.message : "Upload failed",
                  );
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
            <Button disabled={busy} onClick={() => input.current?.click()}>
              <Upload />
              {busy ? "Uploading…" : "Upload images"}
            </Button>
          </>
        }
      />
      <Input
        aria-label="Search media"
        className="mb-5 max-w-sm"
        placeholder="Search images"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p role="status" className="mb-5 text-sm">
        {notice || error}
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_280px]">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {project?.media
            .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
            .map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                className={`overflow-hidden rounded-xl border bg-white text-left ${selected === m.id ? "ring-1 ring-black" : ""}`}
              >
                <img
                  src={m.url}
                  alt={m.alt}
                  className="aspect-[4/3] w-full bg-neutral-100 object-cover"
                  loading="lazy"
                />
                <span className="block truncate p-3 text-xs">{m.name}</span>
              </button>
            ))}
        </div>
        {asset && (
          <aside className="space-y-4 rounded-xl border bg-white p-5 xl:sticky xl:top-24">
            <img
              src={asset.url}
              alt={asset.alt}
              className="w-full rounded-lg bg-neutral-100 object-contain"
            />
            <p className="break-all text-sm font-medium">{asset.name}</p>
            <p className="text-xs text-neutral-500">
              {asset.width} × {asset.height}
              {asset.size ? ` · ${Math.round(asset.size / 1024)} KB` : ""}
            </p>
            <label className="grid gap-2 text-xs">
              Alternative text
              <Input
                key={asset.id + asset.alt}
                defaultValue={asset.alt}
                onBlur={async (e) => {
                  if (e.target.value === asset.alt) return;
                  try {
                    await save({
                      ...project!,
                      media: project!.media.map((m) =>
                        m.id === asset.id ? { ...m, alt: e.target.value } : m,
                      ),
                    });
                    setNotice("Image description saved.");
                  } catch (error) {
                    setNotice(
                      error instanceof Error ? error.message : "Could not save",
                    );
                  }
                }}
              />
            </label>
            <p className="text-xs leading-5 text-neutral-500">
              Choose this image from any image field in the page editor.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
