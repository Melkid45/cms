"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ImagePlus, Upload, X, Check, Search } from "lucide-react";
import { useProject, uploadMedia } from "@/lib/builder/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function MediaPicker({
  value,
  onChange,
  label,
  kind = "image",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  // "video": background video field (hero-v52) — lists and uploads MP4/WebM files only.
  kind?: "image" | "video";
}) {
  const video = kind === "video";
  const isVideo = (mime?: string) => !!mime?.startsWith("video/");
  const { project } = useProject();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value &&
          (video ? (
            <video
              src={value}
              muted
              preload="metadata"
              className="h-16 w-24 rounded-md border bg-neutral-100 object-cover"
            />
          ) : (
            <img
              src={value}
              alt="Selected image"
              className="h-16 w-24 rounded-md border bg-neutral-100 object-contain"
            />
          ))}
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <ImagePlus />
          {label || (video ? "Choose video" : "Choose image")}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={video ? "Remove video" : "Remove image"}
            onClick={() => onChange("")}
          >
            <X />
          </Button>
        )}
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Popup className="fixed inset-5 z-50 mx-auto flex max-w-5xl flex-col overflow-hidden rounded-xl border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <Dialog.Title className="font-semibold">
                  Media library
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-neutral-500">
                  {video
                    ? "Select a saved video or upload an MP4 / WebM file (up to 30 MB, muted loop)."
                    : "Select a saved image or upload a new one."}
                </Dialog.Description>
              </div>
              <div className="flex gap-2">
                <input
                  ref={input}
                  type="file"
                  className="hidden"
                  accept={
                    video
                      ? "video/mp4,video/webm"
                      : "image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml"
                  }
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy(true);
                    setError("");
                    try {
                      const asset = await uploadMedia(file);
                      onChange(asset.url);
                      setOpen(false);
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Upload failed",
                      );
                    } finally {
                      setBusy(false);
                      e.target.value = "";
                    }
                  }}
                />
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  <Upload />
                  {busy ? "Uploading…" : video ? "Upload video" : "Upload image"}
                </Button>
                <Dialog.Close
                  render={<Button type="button" size="icon" variant="ghost" />}
                  aria-label="Close media library"
                >
                  <X />
                </Dialog.Close>
              </div>
            </div>
            <div className="border-b p-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 size-4 text-neutral-400" />
                <Input
                  className="pl-9"
                  placeholder={video ? "Search videos" : "Search images"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="mt-3 text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>
            <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-auto p-5 md:grid-cols-4">
              {project?.media
                .filter(
                  (m) =>
                    isVideo(m.mime) === video &&
                    m.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      onChange(asset.url);
                      setOpen(false);
                    }}
                    className={`relative overflow-hidden rounded-lg border text-left ${asset.url === value ? "border-black ring-1 ring-black" : ""}`}
                  >
                    {video ? (
                      <video
                        src={asset.url}
                        muted
                        preload="metadata"
                        className="aspect-[4/3] w-full bg-neutral-100 object-cover"
                      />
                    ) : (
                      <img
                        src={asset.url}
                        alt={asset.alt}
                        className="aspect-[4/3] w-full bg-neutral-100 object-cover"
                      />
                    )}
                    <span className="block truncate p-2.5 text-xs">
                      {asset.name}
                    </span>
                    {asset.url === value && (
                      <Check className="absolute right-2 top-2 size-6 rounded-full bg-white p-1" />
                    )}
                  </button>
                ))}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
