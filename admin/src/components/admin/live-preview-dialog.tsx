"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectOption } from "@/components/ui/select";
import { SitePreview } from "./site-preview";
import type { PageBlock } from "@/lib/example-pages";
import type { SiteLayout } from "../../../../frontend/src/cms/layout";

export function LivePreviewDialog({
  blocks,
  layout,
}: {
  blocks: PageBlock[];
  layout?: SiteLayout;
}) {
  const [width, setWidth] = useState("100%");

  return (
    <Dialog.Root
      onOpenChange={(_open, details) => {
        if (
          details.reason === "escape-key" &&
          document.querySelector("[data-site-menu][open]")
        )
          details.cancel();
      }}
    >
      <Dialog.Trigger render={<Button type="button" variant="outline" />}>
        <Eye /> Live preview
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-3 z-50 flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background shadow-xl outline-none sm:inset-5">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold">
                Live preview
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Current content, including unsaved changes. Preview only — not
                published.
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-48">
                <Select
                  aria-label="Preview width"
                  value={width}
                  onValueChange={setWidth}
                >
                  <SelectOption value="100%">Fit window</SelectOption>
                  <SelectOption value="390px">Mobile · 390px</SelectOption>
                  <SelectOption value="768px">Tablet · 768px</SelectOption>
                  <SelectOption value="1024px">Laptop · 1024px</SelectOption>
                  <SelectOption value="1440px">Desktop · 1440px</SelectOption>
                </Select>
              </div>
              <Dialog.Close
                render={<Button type="button" variant="ghost" size="icon" />}
                aria-label="Close live preview"
              >
                <X />
              </Dialog.Close>
            </div>
          </div>
          <div
            data-preview-scroll
            className="relative min-h-0 flex-1 overflow-auto bg-neutral-100 p-3 sm:p-6"
          >
            <div
              data-preview-canvas
              style={{ width }}
              className="mx-auto min-h-full shrink-0 overflow-hidden rounded-lg border bg-white shadow-sm"
            >
              <SitePreview blocks={blocks} layout={layout} />
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
