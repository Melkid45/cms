"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, File, ExternalLink, Trash2, RotateCcw } from "lucide-react";
import { hasDraftChanges } from "@/lib/builder/workflows";
import { useProject } from "@/lib/builder/client";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccess } from "@/components/admin/access-context";
export default function Pages() {
  const { project, error, save } = useProject();
  const { isOwner } = useAccess();
  const [query, setQuery] = useState(""),
    [notice, setNotice] = useState("");
  const [trash, setTrash] = useState(false);
  return (
    <div>
      <PageHeader
        title="Pages"
        description={
          isOwner
            ? "Build and publish your website from the approved section library."
            : "Choose a page to update its content."
        }
        action={
          <div className="flex gap-3">
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href="/site/home" target="_blank" />}
            >
              <ExternalLink />
              Open website
            </Button>
            {isOwner && (
              <Button
                nativeButton={false}
                render={<Link href="/dashboard/pages/new" />}
              >
                <Plus />
                New page
              </Button>
            )}
          </div>
        }
      />
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b p-4">
          <div className="mb-4 flex gap-2">
            <Button
              variant={trash ? "ghost" : "secondary"}
              onClick={() => setTrash(false)}
            >
              Pages
            </Button>
            {isOwner && (
              <Button
                variant={trash ? "secondary" : "ghost"}
                onClick={() => setTrash(true)}
              >
                Trash ({project?.pages.filter((p) => p.deletedAt).length || 0})
              </Button>
            )}
          </div>
          <Input
            aria-label="Search pages"
            placeholder="Search pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
        {!project && <p className="p-6">{error || "Loading pages…"}</p>}
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
              className="flex items-center gap-4 border-b p-5 last:border-b-0"
            >
              <File className="size-5 text-neutral-400" />
              <Link
                href={trash ? "#" : `/dashboard/pages/${page.slug}`}
                className="min-w-0 flex-1"
              >
                <p className="font-medium">{page.title}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  /site/{page.slug} · {page.sections.length} sections
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
                  href={`/site/${page.published.slug}`}
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
    </div>
  );
}
