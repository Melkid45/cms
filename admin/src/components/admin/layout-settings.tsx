"use client";

import { useState, useSyncExternalStore } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileText,
  Globe,
  LayoutTemplate,
  Plus,
  Save,
  Search,
  Trash2,
  X,
  CornerDownRight,
  ArrowLeft,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { allPages, storageSnapshot, subscribePages } from "@/lib/page-storage";
import {
  headerVariants,
  footerVariants,
  renderHeader,
  renderFooter,
  type SiteLayout,
} from "../../../../frontend/src/cms/layout";
import {
  layoutSnapshot,
  subscribeLayout,
  readLayout,
  saveLayout,
} from "@/lib/layout-storage";
import { LivePreviewDialog } from "./live-preview-dialog";
import { cn } from "@/lib/utils";
import {
  type MenuItem,
  normalizeMenu,
  menuSiblings,
  moveMenuItem,
} from "@/lib/menu-tree";

type MenuTarget = "header" | "footer";

export function LayoutSettings() {
  const raw = useSyncExternalStore(subscribeLayout, layoutSnapshot, () => "");
  return <LayoutEditor key={raw} initial={readLayout(raw)} />;
}
function LayoutEditor({ initial }: { initial: SiteLayout }) {
  const pagesRaw = useSyncExternalStore(
    subscribePages,
    storageSnapshot,
    () => "",
  );
  const examplePages = allPages(pagesRaw);
  const [content, setContent] = useState(initial);
  const [header, setHeader] = useState<SiteLayout["header"]>(initial.header);
  const [footer, setFooter] = useState<SiteLayout["footer"]>(initial.footer);
  const [menus, setMenus] = useState<Record<MenuTarget, MenuItem[]>>(
    initial.menus,
  );
  const [target, setTarget] = useState<MenuTarget | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const layout: SiteLayout = { ...content, header, footer, menus };
  const snapshot = JSON.stringify(layout);
  const [saved, setSaved] = useState(snapshot);

  function openPicker(type: MenuTarget) {
    setTarget(type);
    setSelection(menus[type].map((item) => item.slug));
    setQuery("");
  }

  function applySelection() {
    if (!target) return;
    setMenus((current) => ({
      ...current,
      [target]: normalizeMenu(
        selection.map(
          (slug) =>
            current[target].find((item) => item.slug === slug) ?? {
              slug,
              label:
                examplePages.find((page) => page.slug === slug)?.title ?? slug,
            },
        ),
      ),
    }));
    setTarget(null);
    setNotice("");
  }

  function move(type: MenuTarget, index: number, direction: number) {
    setMenus((current) => ({
      ...current,
      [type]: moveMenuItem(current[type], current[type][index].slug, direction),
    }));
    setNotice("");
  }

  function changeNesting(type: MenuTarget, slug: string) {
    setMenus((current) => {
      const items = current[type];
      const index = items.findIndex((item) => item.slug === slug);
      const item = items[index];
      if (item.parentSlug) {
        const parent = item.parentSlug;
        const remaining = items.filter((entry) => entry.slug !== slug);
        const lastChild = remaining.findLastIndex(
          (entry) => entry.slug === parent || entry.parentSlug === parent,
        );
        remaining.splice(lastChild + 1, 0, { ...item, parentSlug: undefined });
        return { ...current, [type]: remaining };
      }
      const previous = items
        .slice(0, index)
        .findLast((entry) => !entry.parentSlug);
      if (!previous || items.some((entry) => entry.parentSlug === slug))
        return current;
      return {
        ...current,
        [type]: items.map((entry) =>
          entry.slug === slug ? { ...entry, parentSlug: previous.slug } : entry,
        ),
      };
    });
    setNotice("");
  }

  return (
    <div className="rise-in w-full">
      <PageHeader
        title="Global layout"
        description="Set the header, footer and navigation shared across your website."
        action={
          <Button
            onClick={() => {
              try {
                saveLayout(layout);
                setSaved(snapshot);
                setNotice(
                  "Saved in this browser. Page previews now use this layout; nothing is published.",
                );
              } catch {
                setNotice(
                  "Unable to save. Browser storage may be full or unavailable.",
                );
              }
            }}
          >
            <Save /> Save layout
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3">
        <span className="flex items-center gap-2 text-xs text-neutral-500">
          <Globe className="size-4" /> Applies to every page
        </span>
        <Badge variant="outline">
          {saved === snapshot ? "Saved locally" : "Unsaved changes"}
        </Badge>
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Shared content</CardTitle>
          <p className="text-xs text-neutral-500">
            Switch designs without losing your content. Leave action fields
            empty to hide the button.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(
            [
              ["brand", "Brand name"],
              ["tagline", "Short introduction"],
              ["email", "Contact email"],
              ["actionLabel", "Header button label"],
              ["actionUrl", "Header button URL"],
              ["copyright", "Copyright text"],
              ["phone", "Phone number"],
              ["address", "Address"],
              ["hours", "Opening hours"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="space-y-2 text-sm">
              <span>{label}</span>
              <Input
                maxLength={2000}
                type={field === "email" ? "email" : "text"}
                value={content[field]}
                onChange={(event) => {
                  setContent({ ...content, [field]: event.target.value });
                  setNotice("");
                }}
              />
            </label>
          ))}
        </CardContent>
      </Card>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {(["header", "footer"] as const).map((type) => {
          const variants = type === "header" ? headerVariants : footerVariants;
          const selected = type === "header" ? header : footer;
          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="capitalize">{type}</CardTitle>
                <p className="text-xs text-neutral-500">
                  Choose a layout and build its navigation menu.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  {variants.map((variant) => (
                    <button
                      type="button"
                      key={variant.id}
                      aria-pressed={selected === variant.id}
                      onClick={() => {
                        if (type === "header")
                          setHeader(variant.id as SiteLayout["header"]);
                        else setFooter(variant.id as SiteLayout["footer"]);
                        setNotice("");
                      }}
                      className={cn(
                        "overflow-hidden rounded-lg border text-left transition hover:border-neutral-500",
                        selected === variant.id &&
                          "border-black ring-1 ring-black",
                      )}
                    >
                      <div
                        aria-hidden="true"
                        className="pointer-events-none relative h-28 overflow-hidden border-b bg-white"
                      >
                        <div
                          className="cms-site @container absolute left-0 top-0 w-[600%] origin-top-left scale-[0.166667]"
                          dangerouslySetInnerHTML={{
                            __html: (type === "header"
                              ? renderHeader({
                                  ...layout,
                                  header: variant.id as SiteLayout["header"],
                                })
                              : renderFooter({
                                  ...layout,
                                  footer: variant.id as SiteLayout["footer"],
                                })
                            )
                              .replace(/<a\b[^>]*>/g, "<span>")
                              .replace(/<\/a>/g, "</span>")
                              .replace(/<summary\b[^>]*>/g, "<span>")
                              .replace(/<\/summary>/g, "</span>")
                              .replace(/<details\b[^>]*>/g, "<div>")
                              .replace(/<\/details>/g, "</div>")
                              .replace(/<dialog\b[\s\S]*?<\/dialog>/g, "")
                              .replace(/<button\b[^>]*>/g, "<span>")
                              .replace(/<\/button>/g, "</span>"),
                          }}
                        />
                      </div>
                      <div className="p-3">
                        <span className="flex items-center justify-between text-sm font-medium">
                          {variant.label}
                          {selected === variant.id ? (
                            <Check className="size-4" />
                          ) : (
                            <LayoutTemplate className="size-4 text-neutral-300" />
                          )}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-neutral-500">
                          {variant.description}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-medium">
                      Navigation{" "}
                      <span className="ml-1 text-neutral-400">
                        ({menus[type].length})
                      </span>
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPicker(type)}
                    >
                      <Plus /> Select pages
                    </Button>
                  </div>
                  <p className="mb-3 text-xs text-neutral-400">
                    Use the right arrow to nest a page under the previous item.
                    Two menu levels.
                  </p>
                  <ol className="space-y-2">
                    {menus[type].map((item, index) => {
                      const siblings = menuSiblings(menus[type], item);
                      const siblingIndex = siblings.findIndex(
                        (entry) => entry.slug === item.slug,
                      );
                      const parent = menus[type].find(
                        (entry) => entry.slug === item.parentSlug,
                      );
                      const canNest =
                        index > 0 &&
                        !menus[type].some(
                          (entry) => entry.parentSlug === item.slug,
                        );
                      return (
                        <li
                          key={item.slug}
                          className={cn(
                            "relative flex flex-wrap items-center gap-1 rounded-lg border bg-neutral-50/50 p-2 sm:gap-2 sm:p-3",
                            item.parentSlug &&
                              "ml-6 before:absolute before:-left-4 before:top-0 before:h-1/2 before:w-3 before:rounded-bl before:border-b before:border-l before:border-neutral-300",
                          )}
                        >
                          <div className="min-w-0 flex-1 basis-24">
                            <Input
                              aria-label={`${type} menu label for ${item.slug}`}
                              value={item.label}
                              onChange={(event) => {
                                setMenus((current) => ({
                                  ...current,
                                  [type]: current[type].map((entry) =>
                                    entry.slug === item.slug
                                      ? { ...entry, label: event.target.value }
                                      : entry,
                                  ),
                                }));
                                setNotice("");
                              }}
                              className="h-7 border-transparent bg-transparent shadow-none"
                            />
                            <p className="px-2 text-[11px] text-neutral-400">
                              /{item.slug}
                              {parent && (
                                <span className="ml-2">
                                  · under {parent.label}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={siblingIndex === 0}
                              aria-label={`Move ${item.label} up in ${type}`}
                              title="Move up"
                              onClick={() => move(type, index, -1)}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={siblingIndex === siblings.length - 1}
                              aria-label={`Move ${item.label} down in ${type}`}
                              title="Move down"
                              onClick={() => move(type, index, 1)}
                            >
                              <ArrowDown />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={!item.parentSlug && !canNest}
                              aria-label={`${item.parentSlug ? "Promote" : "Nest"} ${item.label} in ${type}`}
                              title={
                                item.parentSlug
                                  ? "Move to top level"
                                  : "Nest under previous item"
                              }
                              onClick={() => changeNesting(type, item.slug)}
                            >
                              {item.parentSlug ? (
                                <ArrowLeft />
                              ) : (
                                <CornerDownRight />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${item.label} from ${type}`}
                              title="Remove item; keep its children"
                              onClick={() => {
                                setMenus((current) => ({
                                  ...current,
                                  [type]: normalizeMenu(
                                    current[type].filter(
                                      (entry) => entry.slug !== item.slug,
                                    ),
                                  ),
                                }));
                                setNotice("");
                              }}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {menus[type].length === 0 && (
                    <p className="rounded-lg border border-dashed p-6 text-center text-xs text-neutral-400">
                      Select pages to build this menu.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="mt-5 text-xs text-neutral-400">
        Local prototype. Shared across page previews in this browser; publishing
        is not connected yet.
      </p>
      <p className="mt-2 text-sm" role="status">
        {notice}
      </p>
      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <CardTitle>Layout preview</CardTitle>
          <p className="text-xs text-neutral-500">
            Current selection, including unsaved changes.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 pb-6">
            <LivePreviewDialog
              blocks={
                examplePages.find((page) => page.slug === "studio")?.blocks ??
                []
              }
              layout={layout}
            />
          </div>
        </CardContent>
      </Card>
      <Dialog.Root
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-white shadow-xl">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <Dialog.Title className="text-lg font-semibold">
                  Select navigation pages
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-neutral-500">
                  Choose pages for your {target} menu. You can reorder them
                  afterward.
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close page selection"
                className="rounded-md p-1.5 hover:bg-neutral-100"
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <div className="relative m-5 mb-3">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                autoFocus
                aria-label="Search available pages"
                placeholder="Search by page name or URL..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
              />
            </div>
            <div className="min-h-0 space-y-2 overflow-y-auto px-5 pb-5">
              {examplePages
                .filter((page) =>
                  `${page.title} ${page.slug}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((page) => (
                  <label
                    key={page.slug}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition hover:bg-neutral-50",
                      selection.includes(page.slug) &&
                        "border-black bg-neutral-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-black"
                      checked={selection.includes(page.slug)}
                      onChange={(event) =>
                        setSelection((current) =>
                          event.target.checked
                            ? [...current, page.slug]
                            : current.filter((slug) => slug !== page.slug),
                        )
                      }
                    />
                    <span className="grid size-9 place-items-center rounded-md border bg-white">
                      <FileText className="size-4" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">
                        {page.title}
                      </span>
                      <span className="block text-xs text-neutral-400">
                        /{page.slug}
                      </span>
                    </span>
                    <Badge variant="outline">{page.status}</Badge>
                  </label>
                ))}
              {!examplePages.some((page) =>
                `${page.title} ${page.slug}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              ) && (
                <p className="py-8 text-center text-sm text-neutral-500">
                  No pages found.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t p-5">
              <span className="text-xs text-neutral-500">
                {selection.length} pages selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={applySelection}>Apply selection</Button>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
