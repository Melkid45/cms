"use client";
import { Dialog } from "@base-ui/react/dialog";
import { History, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CmsPage, PageVersion } from "@/lib/builder/types";
export function VersionHistory({
  page,
  onRestore,
}: {
  page: CmsPage;
  onRestore: (version: PageVersion) => void;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={<Button type="button" variant="outline" className="w-full" />}
      >
        <History />
        Version history · {page.history?.length || 0}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-white">
          <div className="flex items-start justify-between border-b p-5">
            <div>
              <Dialog.Title className="font-semibold">
                Version history
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-neutral-500">
                The last 20 versions. Restore into the editor, then save or
                publish.
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={<Button type="button" size="icon" variant="ghost" />}
              aria-label="Close version history"
            >
              <X />
            </Dialog.Close>
          </div>
          <div className="overflow-auto p-5">
            {!page.history?.length && (
              <p className="py-8 text-center text-sm text-neutral-500">
                Your first version will appear after saving changes.
              </p>
            )}
            {page.history?.map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between gap-4 border-b py-4 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{version.kind}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {new Date(version.updatedAt).toLocaleString("en-GB")} ·{" "}
                    {version.sections.length} sections
                  </p>
                </div>
                <Dialog.Close
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRestore(version)}
                    />
                  }
                >
                  <RotateCcw />
                  Restore draft
                </Dialog.Close>
              </div>
            ))}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
