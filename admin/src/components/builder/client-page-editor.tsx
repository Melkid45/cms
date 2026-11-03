"use client";
import { useState } from "react";
/* eslint-disable @next/next/no-img-element */
import { ArrowUp, ArrowDown, Save, Globe } from "lucide-react";
import { useProject } from "@/lib/builder/client";
import { safeUrl } from "@/lib/builder/catalog";
import { sectionInfo } from "@/lib/builder/section-info";
import { usePageDraft } from "./use-page-draft";
import type { CmsPage } from "@/lib/builder/types";
import { SectionEditor } from "./section-editor";
import { PreviewDialog } from "./preview-dialog";
import { usePreviewSelection } from "./use-preview-selection";
import {
  SortableSections,
  SortableSection,
  SectionDragHandle,
} from "./sortable-sections";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { EditorDisclosure } from "./editor-disclosure";
export function ClientPageEditor({ initial }: { initial: CmsPage }) {
  const { project } = useProject();
  const [page, setPage] = useState(() => structuredClone(initial));
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const { selectSection: selectFromPreview, clearSelection } =
    usePreviewSelection((id) =>
      setOpenSections((current) => ({ ...current, [id]: true })),
    );
  const canEdit = page.clientAccess?.edit !== false;
  const draft = usePageDraft(page, setPage, project, initial, canEdit);
  const { busy, notice } = draft;
  const locked = page.sections
    .filter((section) => !canEdit || section.clientAccess?.reorder === false)
    .map((section) => section.id);
  if (!project) return null;
  async function persist(publish: boolean) {
    if (!project) return;
    try {
      await draft.persist(publish);
    } catch {}
  }
  function move(index: number, direction: number) {
    const sections = [...page.sections];
    [sections[index], sections[index + direction]] = [
      sections[index + direction],
      sections[index],
    ];
    setPage({ ...page, sections });
  }
  return (
    <div>
      <PageHeader
        title={page.title}
        description="Edit your content or drag sections to change their order."
        action={
          <PreviewDialog
            project={project}
            sections={page.sections}
            onSelectSection={canEdit ? selectFromPreview : undefined}
          />
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-4">
          <SortableSections
            sections={page.sections}
            lockedIds={locked}
            onChange={(sections) => setPage({ ...page, sections })}
          >
            {page.sections.map((section, index) => {
              const info = sectionInfo(section);
              return (
                <SortableSection
                  key={section.id}
                  section={section}
                  disabled={locked.includes(section.id)}
                >
                  <div className="flex items-center gap-3 p-4">
                    <SectionDragHandle
                      index={index}
                      disabled={locked.includes(section.id)}
                    />
                    <img
                      src={safeUrl(info.image || "", true) || info.thumbnail}
                      alt=""
                      className="h-14 w-20 shrink-0 rounded-md border bg-neutral-50 object-cover"
                    />
                    <h2 className="flex-1 font-medium">
                      {info.title}
                      <span className="mt-1 block text-xs font-normal text-neutral-400">
                        {info.family}
                        {locked.includes(section.id)
                          ? " · Position locked"
                          : ""}
                      </span>
                    </h2>
                    <Button
                      aria-label={`Move section ${index + 1} up`}
                      variant="ghost"
                      size="icon-sm"
                      disabled={
                        !index ||
                        locked.includes(section.id) ||
                        locked.includes(page.sections[index - 1]?.id)
                      }
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      aria-label={`Move section ${index + 1} down`}
                      variant="ghost"
                      size="icon-sm"
                      disabled={
                        index === page.sections.length - 1 ||
                        locked.includes(section.id) ||
                        locked.includes(page.sections[index + 1]?.id)
                      }
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                  {canEdit ? (
                    <EditorDisclosure
                      title="Edit content"
                      open={!!openSections[section.id]}
                      onOpenChange={(open) => {
                        if (!open) clearSelection(section.id);
                        setOpenSections((current) => ({
                          ...current,
                          [section.id]: open,
                        }));
                      }}
                      className="rounded-none border-x-0 border-b-0"
                    >
                      <SectionEditor
                        contentOnly
                        section={section}
                        onChange={(next) =>
                          setPage({
                            ...page,
                            sections: page.sections.map((s) =>
                              s.id === next.id ? next : s,
                            ),
                          })
                        }
                      />
                    </EditorDisclosure>
                  ) : (
                    <p className="border-t p-4 text-xs text-neutral-500">
                      This page is managed by your administrator.
                    </p>
                  )}
                </SortableSection>
              );
            })}
          </SortableSections>
        </div>
        <aside className="space-y-3 rounded-xl border bg-white p-5 xl:sticky xl:top-24">
          <h2 className="mb-4 font-semibold">Save your changes</h2>
          <Button
            className="w-full"
            variant="outline"
            disabled={busy || !canEdit}
            onClick={() => persist(false)}
          >
            <Save /> Save draft
          </Button>
          <Button
            className="w-full"
            disabled={busy || !canEdit || page.clientAccess?.publish === false}
            onClick={() => persist(true)}
          >
            <Globe /> Publish changes
          </Button>
          <p role="status" className="text-sm leading-6">
            {canEdit ? draft.label : "Read-only page"}
            <br />
            {notice}
          </p>
        </aside>
      </div>
    </div>
  );
}
