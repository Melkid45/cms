"use client";
/* eslint-disable @next/next/no-img-element */
import { useSiteKey } from "@/components/admin/site-context";
import { pageHref } from "@/lib/builder/i18n";
import { PageTranslations } from "./page-translations";
import { SeoPanel } from "./seo-panel";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  Save,
  Globe,
  Sparkles,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  definitions,
  definition,
  createSection,
  switchSection,
} from "@/lib/builder/catalog";
import { useProject } from "@/lib/builder/client";
import type { CmsPage, Project, Section } from "@/lib/builder/types";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import { SectionEditor } from "./section-editor";
import { PreviewDialog } from "./preview-dialog";
import { usePreviewSelection } from "./use-preview-selection";
import {
  SortableSections,
  SortableSection,
  SectionDragHandle,
} from "./sortable-sections";
import { VersionHistory } from "./version-history";
import { hasDraftChanges } from "@/lib/builder/workflows";
import { useAccess } from "@/components/admin/access-context";
import { ClientPageEditor } from "./client-page-editor";
import { usePageDraft } from "./use-page-draft";
import { sectionInfo } from "@/lib/builder/section-info";
import { SectionClientAccess, PageClientAccess } from "./client-access-editor";
const sectionDefinitions = definitions.filter(
  (d) => !["header", "footer"].includes(d.family),
);
export function slugify(value: string) {
  const ru: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "kh",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "shch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  return [...value.toLowerCase()]
    .map((c) => ru[c] ?? c)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export function PageEditor({ slug }: { slug?: string }) {
  const { project, error } = useProject();
  const { canDesign } = useAccess();
  if (!project) return <p role="status">{error || "Loading your project…"}</p>;
  const page = project.pages.find((p) => p.slug === slug && !p.deletedAt);
  if (slug && !page)
    return (
      <div>
        <p>Page not found.</p>
        <Link href="/dashboard/pages">Back to pages</Link>
      </div>
    );
  if (!canDesign)
    return page ? (
      <ClientPageEditor key={page.id} initial={page} />
    ) : (
      <p>Choose an existing page to edit.</p>
    );
  return <Editor key={page?.id || "new"} initial={page} project={project} />;
}
function Editor({ initial, project }: { initial?: CmsPage; project: Project }) {
  const router = useRouter();
  const siteKey = useSiteKey();
  const [page, setPage] = useState<CmsPage>(
    initial
      ? structuredClone(initial)
      : {
          id: crypto.randomUUID(),
          title: "",
          slug: "",
          locale: project.languages?.default || "en",
          status: "Draft",
          sections: [],
          seo: {
            title: "",
            description: "",
            keywords: "",
            image: "",
            noindex: false,
          },
          updatedAt: "",
        },
  );
  const [family, setFamily] = useState(""),
    [query, setQuery] = useState(""),
    // A fix link from the SEO check (#section-{id}) opens that section's editor.
    [editing, setEditing] = useState(() =>
      typeof window !== "undefined" && window.location.hash.startsWith("#section-")
        ? window.location.hash.slice("#section-".length)
        : "",
    );
  useEffect(() => {
    if (window.location.hash.startsWith("#section-"))
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, []);
  const { selectSection: selectFromPreview, clearSelection } =
    usePreviewSelection(setEditing);
  const draft = usePageDraft(page, setPage, project, initial);
  const { notice, setNotice, busy, dirty } = draft;
  const patch = (data: Partial<CmsPage>) => {
    setPage((p) => ({ ...p, ...data }));
    setNotice("");
  };
  const updateSection = (section: Section) =>
    patch({
      sections: page.sections.map((s) => (s.id === section.id ? section : s)),
    });
  async function persist(status: CmsPage["status"]) {
    try {
      await draft.persist(status === "Published");
      if (page.slug !== initial?.slug)
        router.replace(`/dashboard/pages/${page.slug}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save");
    }
  }
  function move(index: number, direction: number) {
    const sections = [...page.sections];
    [sections[index], sections[index + direction]] = [
      sections[index + direction],
      sections[index],
    ];
    patch({ sections });
  }
  const families = [...new Set(sectionDefinitions.map((d) => d.family))];
  return (
    <div>
      <Link
        href="/dashboard/pages"
        className="mb-5 inline-flex items-center gap-2 text-xs text-neutral-500"
      >
        <ArrowLeft className="size-4" />
        Back to pages
      </Link>
      <PageHeader
        title={initial ? `Edit ${initial.title}` : "Create a page"}
        action={
          <PreviewDialog
            project={project}
            sections={page.sections}
            locale={page.locale}
            onSelectSection={selectFromPreview}
          />
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void persist("Draft");
        }}
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]"
      >
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Page details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="page-name">Page name</Label>
                <Input
                  id="page-name"
                  required
                  maxLength={200}
                  value={page.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="About the studio"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="page-slug">Slug</Label>
                <div className="relative">
                  <Input
                    id="page-slug"
                    className="pr-10"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={page.slug}
                    onChange={(e) => patch({ slug: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="absolute right-1 top-1"
                    aria-label="Generate slug from page name"
                    onClick={() => patch({ slug: slugify(page.title) })}
                  >
                    <Sparkles />
                  </Button>
                </div>
                <p className="text-xs text-neutral-400">
                  {pageHref(project, siteKey, {
                    slug: page.slug || "your-page",
                    locale: page.locale,
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Page sections</CardTitle>
                <span className="text-xs text-neutral-400">
                  {page.sections.length} sections
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!page.sections.length && (
                <p className="rounded-lg border border-dashed p-10 text-center text-sm text-neutral-400">
                  Choose your first section from the library below.
                </p>
              )}
              <SortableSections
                sections={page.sections}
                onChange={(sections) => patch({ sections })}
              >
                {page.sections.map((section, index) => {
                  const d = definition(section.variant)!;
                  const info = sectionInfo(section);
                  return (
                    <SortableSection key={section.id} section={section}>
                      <div className="flex flex-wrap items-center gap-3 p-3">
                        <SectionDragHandle index={index} />
                        <img
                          src={d.thumbnail}
                          alt={`${d.title} ${d.label}`}
                          className="h-16 w-24 rounded border bg-neutral-100 object-cover object-top"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{info.title}</p>
                          <p className="text-xs text-neutral-500">
                            {d.title} · {d.label}
                          </p>
                          {section.hidden && (
                            <span className="text-xs text-neutral-400">
                              Hidden on website
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant={
                            editing === section.id ? "secondary" : "outline"
                          }
                          size="sm"
                          onClick={() => {
                            clearSelection();
                            setEditing(
                              editing === section.id ? "" : section.id,
                            );
                          }}
                        >
                          {editing === section.id ? "Close" : "Edit content"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${section.hidden ? "Show" : "Hide"} section ${index + 1}`}
                          onClick={() =>
                            updateSection({
                              ...section,
                              hidden: !section.hidden,
                            })
                          }
                        >
                          {section.hidden ? <Eye /> : <EyeOff />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Duplicate section ${index + 1}`}
                          onClick={() =>
                            patch({
                              sections: [
                                ...page.sections.slice(0, index + 1),
                                {
                                  ...structuredClone(section),
                                  id: crypto.randomUUID(),
                                },
                                ...page.sections.slice(index + 1),
                              ],
                            })
                          }
                        >
                          <Copy />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={!index}
                          aria-label={`Move section ${index + 1} up`}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === page.sections.length - 1}
                          aria-label={`Move section ${index + 1} down`}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove section ${index + 1}`}
                          onClick={() =>
                            patch({
                              sections: page.sections.filter(
                                (s) => s.id !== section.id,
                              ),
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      {editing === section.id && (
                        <div
                          id={`section-${section.id}`}
                          className="space-y-4 border-t bg-neutral-50/60 p-4"
                        >
                          <div className="grid gap-2">
                            <Label>Variation</Label>
                            <Select
                              value={section.variant}
                              onValueChange={(variant) => {
                                if (
                                  section.collections &&
                                  !definition(variant)?.repeaters?.length &&
                                  !confirm(
                                    "This variation uses a fixed composition. Custom card lists will be replaced. Continue?",
                                  )
                                )
                                  return;
                                updateSection(switchSection(section, variant));
                              }}
                            >
                              {sectionDefinitions
                                .filter((v) => v.family === d.family)
                                .map((v) => (
                                  <SelectOption key={v.id} value={v.id}>
                                    {v.label}
                                  </SelectOption>
                                ))}
                            </Select>
                            <p className="text-xs text-neutral-500">
                              Custom content is carried over to matching fields.
                              Preview after changing a layout.
                            </p>
                          </div>
                          <SectionEditor
                            section={section}
                            onChange={updateSection}
                          />
                          <SectionClientAccess
                            section={section}
                            onChange={updateSection}
                          />
                        </div>
                      )}
                    </SortableSection>
                  );
                })}
              </SortableSections>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {family
                    ? `${sectionDefinitions.find((d) => d.family === family)?.title} variations`
                    : "Section library"}
                </CardTitle>
                {family && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFamily("")}
                  >
                    <ArrowLeft />
                    All sections
                  </Button>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                Only the new approved library. Click a variation to add it.
              </p>
            </CardHeader>
            <CardContent>
              {!family && (
                <Input
                  className="mb-4"
                  placeholder="Search sections"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {family
                  ? sectionDefinitions
                      .filter((d) => d.family === family)
                      .map((d) => (
                        <div
                          key={d.id}
                          className="overflow-hidden rounded-xl border bg-white"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const section = createSection(d.id);
                              patch({ sections: [...page.sections, section] });
                              setEditing(section.id);
                              setNotice(`${d.title} · ${d.label} added.`);
                            }}
                            className="w-full text-left transition hover:bg-neutral-50"
                          >
                            <img
                              src={d.thumbnail}
                              alt={`${d.title} — ${d.label}`}
                              className="aspect-[16/10] w-full bg-neutral-100 object-contain"
                              loading="lazy"
                            />
                            <span className="flex items-center justify-between border-t p-4">
                              <span>
                                <span className="block text-sm font-medium">
                                  {d.label}
                                </span>
                                <span className="text-xs text-neutral-400">
                                  {d.id}
                                </span>
                              </span>
                              <Plus className="size-4" />
                            </span>
                          </button>
                          <a
                            href={`/library/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 border-t p-2.5 text-xs text-neutral-500 hover:text-black"
                          >
                            <ExternalLink className="size-3.5" />
                            Preview at full size
                          </a>
                        </div>
                      ))
                  : families
                      .filter((f) => f.includes(query.toLowerCase()))
                      .map((f) => {
                        const list = sectionDefinitions.filter(
                          (d) => d.family === f,
                        );
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setFamily(f)}
                            className="overflow-hidden rounded-xl border bg-white text-left transition hover:border-black"
                          >
                            <img
                              src={list[0].thumbnail}
                              alt={list[0].title}
                              className="aspect-[16/9] w-full bg-neutral-100 object-contain"
                              loading="lazy"
                            />
                            <span className="flex items-center justify-between border-t p-4">
                              <span>
                                <span className="block text-sm font-medium">
                                  {list[0].title}
                                </span>
                                <span className="text-xs text-neutral-400">
                                  {list.length} variations
                                </span>
                              </span>
                              <ChevronRight className="size-4" />
                            </span>
                          </button>
                        );
                      })}
              </div>
            </CardContent>
          </Card>
          <SeoPanel
            page={page}
            project={project}
            siteKey={siteKey}
            onChange={(seo) => patch({ seo })}
          />
        </div>
        <aside className="space-y-5 xl:sticky xl:top-24">
          <Card>
            <CardHeader>
              <CardTitle>Publishing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-xs">
                <span>
                  {page.published ? "Published" : "Draft"}
                  {page.published && hasDraftChanges(page)
                    ? " · draft changes"
                    : ""}
                </span>
                <span className="text-neutral-500">
                  {dirty ? "Unsaved changes" : "Saved"}
                </span>
              </div>
              <Button
                type="submit"
                className="w-full"
                variant="outline"
                disabled={busy}
              >
                <Save />
                Save draft
              </Button>
              <Button
                type="button"
                className="w-full"
                disabled={
                  busy ||
                  !page.sections.length ||
                  !page.title.trim() ||
                  !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.slug)
                }
                onClick={() => void persist("Published")}
              >
                <Globe />
                {busy ? "Saving…" : "Publish page"}
              </Button>
              {initial?.status === "Published" && (
                <a
                  href={pageHref(project, siteKey, page.published || initial)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm"
                >
                  <ExternalLink className="size-4" />
                  Open website
                </a>
              )}
              <p role="status" className="text-xs leading-5">
                {draft.label}
                <br />
                {notice}
              </p>
              <p className="text-xs leading-5 text-neutral-400">
                Save draft keeps the live website unchanged. Publish applies
                your current version.
              </p>
              <VersionHistory
                page={page}
                onRestore={(version) => {
                  patch({
                    title: version.title,
                    slug: version.slug,
                    locale: version.locale,
                    sections: structuredClone(version.sections),
                    seo: structuredClone(version.seo),
                  });
                  setNotice(
                    "Version loaded into the editor. Save draft or publish when ready.",
                  );
                }}
              />
            </CardContent>
          </Card>
          <PageClientAccess page={page} onChange={patch} />
          <div id="page-translations" />
          <PageTranslations
            page={page}
            project={project}
            saved={!!initial && !dirty && page.slug === initial.slug}
            onLocale={(locale) => patch({ locale })}
            onGroup={(translationGroup) =>
              setPage((p) => ({ ...p, translationGroup }))
            }
          />
        </aside>
      </form>
    </div>
  );
}
