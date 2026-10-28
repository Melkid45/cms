"use client";
import { useState } from "react";
import { ArrowUp, ArrowDown, Save, Globe } from "lucide-react";
import { useProject } from "@/lib/builder/client";
import { definition } from "@/lib/builder/catalog";
import type { CmsPage } from "@/lib/builder/types";
import { SectionEditor } from "./section-editor";
import { PreviewDialog } from "./preview-dialog";
import {
  SortableSections,
  SortableSection,
  SectionDragHandle,
} from "./sortable-sections";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { EditorDisclosure } from "./editor-disclosure";
export function ClientPageEditor({ initial }: { initial: CmsPage }) {
  const { project, save } = useProject();
  const [page, setPage] = useState(() => structuredClone(initial)),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (!project) return null;
  async function persist(publish: boolean) {
    if (!project) return;
    setBusy(true);
    setNotice("");
    try {
      const saved = await save(
        {
          ...project,
          pages: project.pages.map((p) =>
            p.id === page.id ? { ...p, sections: page.sections } : p,
          ),
        },
        publish ? page.id : undefined,
      );
      setPage(saved.pages.find((p) => p.id === page.id)!);
      setNotice(
        publish
          ? "Changes published on your website."
          : "Draft saved. Your live website is unchanged.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
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
        action={<PreviewDialog project={project} sections={page.sections} />}
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-4">
          <SortableSections
            sections={page.sections}
            onChange={(sections) => setPage({ ...page, sections })}
          >
            {page.sections.map((section, index) => (
              <SortableSection key={section.id} section={section}>
                <div className="flex items-center gap-3 p-4">
                  <SectionDragHandle index={index} />
                  <h2 className="flex-1 font-medium">
                    {definition(section.variant)?.title ||
                      `Section ${index + 1}`}
                  </h2>
                  <Button
                    aria-label={`Move section ${index + 1} up`}
                    variant="ghost"
                    size="icon-sm"
                    disabled={!index}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    aria-label={`Move section ${index + 1} down`}
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === page.sections.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
                <EditorDisclosure
                  title="Edit content"
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
              </SortableSection>
            ))}
          </SortableSections>
        </div>
        <aside className="space-y-3 rounded-xl border bg-white p-5 xl:sticky xl:top-24">
          <h2 className="mb-4 font-semibold">Save your changes</h2>
          <Button
            className="w-full"
            variant="outline"
            disabled={busy}
            onClick={() => persist(false)}
          >
            <Save /> Save draft
          </Button>
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => persist(true)}
          >
            <Globe /> Publish changes
          </Button>
          <p role="status" className="text-sm leading-6">
            {notice}
          </p>
        </aside>
      </div>
    </div>
  );
}
