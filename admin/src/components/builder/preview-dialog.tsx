"use client";
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectOption } from "@/components/ui/select";
import { SiteFrame } from "./site-frame";
import type { Project, Section } from "@/lib/builder/types";
export function PreviewDialog({
  project,
  sections,
}: {
  project: Project;
  sections: Section[];
}) {
  const [width, setWidth] = useState("100%");
  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button type="button" variant="outline" />}>
        <Eye />
        Live preview
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-xl bg-white">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div>
              <Dialog.Title className="text-sm font-semibold">
                Live preview
              </Dialog.Title>
              <Dialog.Description className="text-xs text-neutral-500">
                Your current content, including unsaved changes.
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-3">
              <Select
                aria-label="Preview width"
                value={width}
                onValueChange={setWidth}
              >
                <SelectOption value="100%">Fit window</SelectOption>
                {["390", "768", "1024", "1440", "1920"].map((w) => (
                  <SelectOption value={`${w}px`} key={w}>
                    {w}px
                  </SelectOption>
                ))}
              </Select>
              <Dialog.Close
                render={<Button type="button" variant="ghost" size="icon" />}
                aria-label="Close preview"
              >
                <X />
              </Dialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-neutral-100 p-3">
            <SiteFrame
              project={project}
              sections={sections}
              width={width}
              className="mx-auto block"
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
