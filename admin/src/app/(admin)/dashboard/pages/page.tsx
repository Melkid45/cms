"use client";
import { useSiteKey } from "@/components/admin/site-context";
import { sitePath } from "@/lib/builder/site-links";
import { pageHref } from "@/lib/builder/i18n";
import { useState } from "react";
import Link from "next/link";
import { Plus, File, ExternalLink, Trash2, RotateCcw } from "lucide-react";
import { hasDraftChanges } from "@/lib/builder/workflows";
import { useProject } from "@/lib/builder/client";
import { AdminPanel, Segmented } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccess } from "@/components/admin/access-context";
export default function Pages() {
  const { project, error, save } = useProject();
  const { canDesign: isOwner } = useAccess();
  const siteKey = useSiteKey();
  const homeHref = sitePath(
    siteKey,
    project?.pages.find((p) => p.id === project.layout.homePageId)?.slug ||
      "home",
  );
  const [query, setQuery] = useState(""),
    [notice, setNotice] = useState("");
  const [trash, setTrash] = useState(false);
  return (
    <AdminPanel
      title="Pages"
      toolbar={
        <>
          <Segmented
            active={trash ? "trash" : "pages"}
            onSelect={(id) => setTrash(id === "trash")}
            items={[
              ["pages", "Pages"],
              ...(isOwner
                ? ([["trash", `Trash (${project?.pages.filter((p) => p.deletedAt).length || 0})`]] as const)
                : []),
            ]}
          />
          <Input
            aria-label="Search pages"
            placeholder="Search pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 min-w-0 flex-1 basis-full border-[#e2e2e2] bg-white px-3 text-sm sm:basis-60"
          />
          <Button
            variant="outline"
            className="h-10 px-4"
            nativeButton={false}
            render={<a href={homeHref} target="_blank" />}
          >
            <ExternalLink />
            Open website
          </Button>
          {isOwner && (
            <Button
              className="h-10 px-4"
              nativeButton={false}
              render={<Link href="/dashboard/pages/new" />}
            >
              <Plus />
              New page
            </Button>
          )}
        </>
      }
    >
      <div>
        {!project && <p className="py-4">{error || "Loading pages…"}</p>}
        {project?.pages
          .filter(
            (p) =>
              !!p.deletedAt === trash &&
              `${p.title} ${p.slug}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((page) => (
            <div
              key={page.id}
              className="flex items-center gap-4 border-b py-4 last:border-b-0"
            >
              <File className="size-5 text-neutral-400" />
              <Link
                href={trash ? "#" : `/dashboard/pages/${page.slug}`}
                className="min-w-0 flex-1"
              >
                <p className="font-medium">{page.title}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {pageHref(project, siteKey, page)}
                  {project.languages && project.languages.enabled.length > 1
                    ? ` · ${page.locale.toUpperCase()}`
                    : ""}{" "}
                  · {page.sections.length} sections
                </p>
              </Link>
              <span className="rounded-full border px-3 py-1 text-xs">
                {trash
                  ? "In trash"
                  : page.published
                    ? `Published${hasDraftChanges(page) ? " · draft changes" : ""}`
                    : "Draft"}
              </span>
              {!trash && page.published && (
                <a
                  href={pageHref(project, siteKey, page.published)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2"
                  aria-label={`Open ${page.title}`}
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
              {isOwner && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${trash ? "Restore" : "Move to trash"} ${page.title}`}
                  disabled={project.layout.homePageId === page.id}
                  onClick={async () => {
                    if (
                      !trash &&
                      !confirm(
                        `Move “${page.title}” to trash? You can restore it later.`,
                      )
                    )
                      return;
                    try {
                      await save({
                        ...project,
                        pages: project.pages.map((p) =>
                          p.id === page.id
                            ? {
                                ...p,
                                deletedAt: trash
                                  ? undefined
                                  : new Date().toISOString(),
                              }
                            : p,
                        ),
                      });
                      setNotice(
                        trash ? "Page restored." : "Page moved to trash.",
                      );
                    } catch (e) {
                      setNotice(
                        e instanceof Error
                          ? e.message
                          : "Could not delete page",
                      );
                    }
                  }}
                >
                  {trash ? <RotateCcw /> : <Trash2 />}
                </Button>
              )}
            </div>
          ))}
      </div>
      <p role="status" className="mt-4 text-sm">
        {notice}
      </p>
    </AdminPanel>
  );
}
