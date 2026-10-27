"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  Save,
  Plus,
  X,
  Trash2,
  ArrowDown,
  ArrowUp,
  CornerDownRight,
} from "lucide-react";
import { definitions, createSection } from "@/lib/builder/catalog";
import { separateLayoutMenus } from "@/lib/builder/menus";
import { useProject } from "@/lib/builder/client";
import type { Project, Menu, MenuItem } from "@/lib/builder/types";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { SectionEditor } from "./section-editor";
import { PreviewDialog } from "./preview-dialog";
export function LayoutEditor() {
  const { project, error } = useProject();
  return project ? (
    <Editor
      key={
        "independent-menus-" +
        project.layout.header.id +
        project.layout.footer.id
      }
      project={separateLayoutMenus(project)}
    />
  ) : (
    <p>{error || "Loading layout…"}</p>
  );
}
function Editor({ project }: { project: Project }) {
  const { save } = useProject();
  const [layout, setLayout] = useState(project.layout),
    [menus, setMenus] = useState(project.menus),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState<string | null>(null),
    [chosen, setChosen] = useState<string[]>([]),
    [edit, setEdit] = useState("");
  const draft = { ...project, layout, menus };
  const patchMenu = (id: string, items: MenuItem[]) =>
    setMenus(menus.map((m) => (m.id === id ? { ...m, items } : m)));
  function renderItems(
    menu: Menu,
    items: MenuItem[],
    parentId?: string,
  ): React.ReactNode {
    return items.map((item, index) => (
      <div key={item.id} className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border bg-white p-2">
          <Input
            aria-label="Menu item label"
            className="h-8 flex-1"
            value={item.label}
            onChange={(e) => {
              const change = (list: MenuItem[]): MenuItem[] =>
                list.map((i) =>
                  i.id === item.id
                    ? { ...i, label: e.target.value }
                    : { ...i, children: change(i.children) },
                );
              patchMenu(menu.id, change(menu.items));
            }}
          />
          <span className="max-w-24 truncate text-xs text-neutral-400">
            {project.pages.find((p) => p.id === item.pageId)?.slug || item.url}
          </span>
          {[-1, 1].map((direction) => (
            <Button
              type="button"
              key={direction}
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${item.label} ${direction < 0 ? "up" : "down"}`}
              disabled={
                index + direction < 0 || index + direction >= items.length
              }
              onClick={() => {
                const next = [...items];
                [next[index], next[index + direction]] = [
                  next[index + direction],
                  next[index],
                ];
                patchMenu(
                  menu.id,
                  parentId
                    ? menu.items.map((i) =>
                        i.id === parentId ? { ...i, children: next } : i,
                      )
                    : next,
                );
              }}
            >
              {direction < 0 ? <ArrowUp /> : <ArrowDown />}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              parentId ? `Outdent ${item.label}` : `Nest ${item.label}`
            }
            disabled={!parentId && (index === 0 || item.children.length > 0)}
            onClick={() => {
              if (parentId) {
                const next = menu.items.map((i) =>
                  i.id === parentId
                    ? {
                        ...i,
                        children: i.children.filter((c) => c.id !== item.id),
                      }
                    : i,
                );
                const position = next.findIndex((i) => i.id === parentId);
                next.splice(position + 1, 0, item);
                patchMenu(menu.id, next);
              } else {
                const next = [...menu.items];
                const previous = {
                  ...next[index - 1],
                  children: [...next[index - 1].children, item],
                };
                next[index - 1] = previous;
                next.splice(index, 1);
                patchMenu(menu.id, next);
              }
            }}
          >
            <CornerDownRight className={parentId ? "rotate-180" : ""} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${item.label} from menu`}
            onClick={() => {
              const remove = (list: MenuItem[]): MenuItem[] =>
                list
                  .filter((i) => i.id !== item.id)
                  .map((i) => ({ ...i, children: remove(i.children) }));
              patchMenu(menu.id, remove(menu.items));
            }}
          >
            <Trash2 />
          </Button>
        </div>
        {!!item.children.length && (
          <div className="ml-6 space-y-2 border-l pl-3">
            {renderItems(menu, item.children, item.id)}
          </div>
        )}
      </div>
    ));
  }
  return (
    <div>
      <PageHeader
        title="Site layout"
        description="Shared headers, footers and menus for every page."
        action={
          <div className="flex gap-3">
            <PreviewDialog
              project={draft}
              sections={project.pages[0]?.sections || []}
            />
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await save(draft);
                  setNotice(
                    "Layout and menus saved. Every page now uses these settings.",
                  );
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : "Could not save");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Save />
              {busy ? "Saving…" : "Save layout"}
            </Button>
          </div>
        }
      />
      <p role="status" className="mb-5 text-sm">
        {notice}
      </p>
      <div className="mb-6 rounded-xl border bg-white p-5">
        <label className="grid max-w-md gap-2 text-sm font-medium">
          Home page
          <Select
            value={layout.homePageId}
            onValueChange={(homePageId) => setLayout({ ...layout, homePageId })}
          >
            {project.pages
              .filter((p) => !p.deletedAt)
              .map((p) => (
                <SelectOption key={p.id} value={p.id}>
                  {p.title}
                </SelectOption>
              ))}
          </Select>
        </label>
      </div>
      {(["header", "footer"] as const).map((type) => (
        <Card key={type} className="mb-6">
          <CardHeader>
            <CardTitle>{type === "header" ? "Header" : "Footer"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {definitions
                .filter((d) => d.family === type)
                .map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() =>
                      setLayout({
                        ...layout,
                        [type]: createSection(d.id, layout[type].id),
                      })
                    }
                    className={`overflow-hidden rounded-xl border text-left ${layout[type].variant === d.id ? "ring-1 ring-black" : ""}`}
                  >
                    <img
                      src={d.thumbnail}
                      alt={`${type} ${d.label}`}
                      className="aspect-[16/7] w-full bg-neutral-100 object-contain object-center"
                    />
                    <span className="block border-t p-3 text-sm">
                      {d.label}
                    </span>
                  </button>
                ))}
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Navigation groups</p>
              <div className="flex flex-wrap gap-3">
                {menus
                  .filter((menu) => menu.placement === type)
                  .map((menu) => (
                    <label
                      key={menu.id}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={layout[`${type}Menus`].includes(menu.id)}
                        onChange={(e) =>
                          setLayout({
                            ...layout,
                            [`${type}Menus`]: e.target.checked
                              ? [...layout[`${type}Menus`], menu.id]
                              : layout[`${type}Menus`].filter(
                                  (id) => id !== menu.id,
                                ),
                          })
                        }
                      />
                      {menu.title}
                    </label>
                  ))}
              </div>
              <p className="text-xs text-neutral-400">
                Choose one or more {type} menus. Edit their items in the {type}{" "}
                navigation panel below.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEdit(edit === type ? "" : type)}
            >
              {edit === type ? "Hide" : "Edit"} {type} content
            </Button>
            {edit === type && (
              <SectionEditor
                section={layout[type]}
                onChange={(section) =>
                  setLayout({ ...layout, [type]: section })
                }
              />
            )}
          </CardContent>
        </Card>
      ))}
      {(["header", "footer"] as const).map((placement) => (
        <Card key={placement} className="mb-6" data-menu-placement={placement}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {placement === "header"
                    ? "Header navigation"
                    : "Footer navigation"}
                </CardTitle>
                <p className="mt-1 text-xs text-neutral-500">
                  Independent menus for the {placement}.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  setMenus([
                    ...menus,
                    {
                      id: crypto.randomUUID(),
                      title: "New menu",
                      items: [],
                      placement,
                    },
                  ])
                }
              >
                <Plus />
                New {placement} menu
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {menus
              .filter((menu) => menu.placement === placement)
              .map((menu) => (
                <div
                  key={menu.id}
                  className="space-y-3 rounded-xl border bg-neutral-50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <Input
                      aria-label="Menu name"
                      value={menu.title}
                      className="max-w-sm bg-white font-medium"
                      onChange={(e) =>
                        setMenus(
                          menus.map((m) =>
                            m.id === menu.id
                              ? { ...m, title: e.target.value }
                              : m,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTarget(menu.id);
                        const all = (items: MenuItem[]): string[] =>
                          items.flatMap((i) => [i.pageId, ...all(i.children)]);
                        setChosen(all(menu.items));
                      }}
                    >
                      <Plus />
                      Choose pages
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete menu ${menu.title}`}
                      onClick={() => {
                        setMenus(menus.filter((m) => m.id !== menu.id));
                        setLayout({
                          ...layout,
                          headerMenus: layout.headerMenus.filter(
                            (id) => id !== menu.id,
                          ),
                          footerMenus: layout.footerMenus.filter(
                            (id) => id !== menu.id,
                          ),
                        });
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {renderItems(menu, menu.items)}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patchMenu(menu.id, [
                        ...menu.items,
                        {
                          id: crypto.randomUUID(),
                          label: "New link",
                          pageId: "",
                          url: "https://example.com",
                          children: [],
                        },
                      ])
                    }
                  >
                    <Plus />
                    Add external link
                  </Button>
                  {menu.items
                    .filter((i) => !i.pageId)
                    .map((item) => (
                      <label key={item.id} className="grid gap-2 text-xs">
                        {item.label} · destination
                        <Input
                          value={item.url}
                          onChange={(e) =>
                            patchMenu(
                              menu.id,
                              menu.items.map((i) =>
                                i.id === item.id
                                  ? { ...i, url: e.target.value }
                                  : i,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                </div>
              ))}
          </CardContent>
        </Card>
      ))}
      <Dialog.Root
        open={!!target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="font-semibold">
                  Choose pages
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-neutral-500">
                  Add pages to this navigation group.
                </Dialog.Description>
              </div>
              <Dialog.Close
                render={<Button variant="ghost" size="icon" />}
                aria-label="Close page picker"
              >
                <X />
              </Dialog.Close>
            </div>
            <div className="my-5 max-h-80 space-y-2 overflow-auto">
              {project.pages
                .filter((p) => !p.deletedAt)
                .map((page) => (
                  <label
                    key={page.id}
                    className="flex items-center gap-3 rounded-lg border p-4"
                  >
                    <input
                      type="checkbox"
                      checked={chosen.includes(page.id)}
                      onChange={(e) =>
                        setChosen(
                          e.target.checked
                            ? [...chosen, page.id]
                            : chosen.filter((id) => id !== page.id),
                        )
                      }
                    />
                    <span className="flex-1 text-sm">{page.title}</span>
                    <span className="text-xs text-neutral-400">
                      /site/{page.slug}
                    </span>
                  </label>
                ))}
            </div>
            <Button
              className="w-full"
              onClick={() => {
                const menu = menus.find((m) => m.id === target);
                if (!menu) return;
                const keep = (items: MenuItem[]): MenuItem[] =>
                  items
                    .filter((i) => !i.pageId || chosen.includes(i.pageId))
                    .map((i) => ({ ...i, children: keep(i.children) }));
                const existing = keep(menu.items);
                const contains = (items: MenuItem[], id: string): boolean =>
                  items.some(
                    (i) => i.pageId === id || contains(i.children, id),
                  );
                for (const id of chosen)
                  if (!contains(existing, id)) {
                    const p = project.pages.find((p) => p.id === id)!;
                    existing.push({
                      id: crypto.randomUUID(),
                      label: p.title,
                      pageId: p.id,
                      url: "",
                      children: [],
                    });
                  }
                patchMenu(menu.id, existing);
                setTarget(null);
              }}
            >
              Apply selection
            </Button>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
