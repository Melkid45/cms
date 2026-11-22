"use client";
import { useState } from "react";
import Link from "next/link";
import { useProject, saveProject } from "@/lib/builder/client";
import type { CatalogSettings as Settings } from "@/lib/builder/types";
import {
  catalogVariants,
  productPageVariants,
  productCardVariants,
} from "@/lib/builder/types";
import { AppearancePicker } from "./appearance-picker";
import { defaultCatalog } from "@/lib/shop/catalog";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const layouts = {
  grid: {
    name: "Classic grid",
    description: "Three balanced columns with filters above the collection.",
  },
  sidebar: {
    name: "Sidebar",
    description: "A calm two-column collection with filters on the left.",
  },
  editorial: {
    name: "Large cards",
    description: "Wide photography and soft panels beneath each image.",
  },
  list: {
    name: "Product list",
    description: "Horizontal cards with room for product descriptions.",
  },
};
export function CatalogSettings({ attributes }: { attributes: string[] }) {
  const { project } = useProject();
  const [draft, setDraft] = useState<Settings>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (!project) return <p>Loading catalog settings…</p>;
  const settings = draft ?? project.store?.catalog ?? defaultCatalog;
  function update(patch: Partial<Settings>) {
    setDraft({ ...settings, ...patch });
  }
  async function save() {
    if (!project?.store || !draft) return;
    setBusy(true);
    setNotice("");
    try {
      await saveProject({
        ...project,
        store: { ...project.store, catalog: draft },
      });
      setDraft(undefined);
      setNotice("Catalog settings saved.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Catalog"
        description="Choose what customers see in your collection."
        action={
          <Button disabled={!draft || busy} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        }
      />
      {notice && <p role="status">{notice}</p>}
      <fieldset disabled={busy} className="space-y-5">
        <AppearancePicker
          kind="card"
          title="Product cards"
          value={settings.productCard || "minimal"}
          options={productCardVariants}
          onChange={(productCard) => update({ productCard })}
          preview={`/catalog-preview?layout=${settings.variant || "grid"}&card=${settings.productCard || "minimal"}`}
        />
        <AppearancePicker
          kind="page"
          title="Product page"
          value={settings.productPage || "split"}
          options={productPageVariants}
          onChange={(productPage) => update({ productPage })}
          preview={`/product-preview?layout=${settings.productPage || "split"}`}
        />
        <Card>
          <CardHeader>
            <CardTitle>Catalog layout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              role="radiogroup"
              aria-label="Catalog layout"
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              {catalogVariants.map((variant) => (
                <label
                  key={variant}
                  className={`relative cursor-pointer overflow-hidden rounded-xl border p-4 transition hover:border-neutral-500 ${(settings.variant || "grid") === variant ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"}`}
                >
                  <input
                    type="radio"
                    name="catalog-layout"
                    value={variant}
                    checked={(settings.variant || "grid") === variant}
                    onChange={() => update({ variant })}
                    className="absolute right-4 top-4 accent-black"
                  />
                  <span
                    aria-hidden="true"
                    className="mb-4 flex aspect-[4/3] gap-2 rounded-lg bg-neutral-100 p-3 pt-6"
                  >
                    {variant === "sidebar" && (
                      <span className="w-1/4 rounded bg-white" />
                    )}
                    <span
                      className={`grid flex-1 gap-2 ${variant === "list" ? "grid-cols-1" : variant === "grid" ? "grid-cols-3" : "grid-cols-2"}`}
                    >
                      {Array.from(
                        { length: variant === "list" ? 3 : 6 },
                        (_, i) => (
                          <span
                            key={i}
                            className={`flex overflow-hidden rounded bg-white ${variant === "list" ? "flex-row" : "flex-col"}`}
                          >
                            <span
                              className={`block bg-neutral-300 ${variant === "list" ? "w-1/3" : "h-2/3"}`}
                            />
                            <span className="m-1 block h-1 w-1/2 rounded bg-neutral-200" />
                          </span>
                        ),
                      )}
                    </span>
                  </span>
                  <span className="block text-sm font-medium">
                    {layouts[variant].name}
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                    {layouts[variant].description}
                  </span>
                </label>
              ))}
            </div>
            <Link
              className="text-sm underline"
              href={`/catalog-preview?layout=${settings.variant || "grid"}&card=${settings.productCard || "minimal"}`}
              target="_blank"
            >
              Preview selected layout
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Catalog page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
              />{" "}
              Enable catalog page
            </label>
            <label className="grid gap-2">
              Title
              <Input
                value={settings.title}
                onChange={(e) => update({ title: e.target.value })}
                maxLength={160}
              />
            </label>
            <label className="grid gap-2">
              Description
              <Input
                value={settings.description}
                onChange={(e) => update({ description: e.target.value })}
                maxLength={1000}
              />
            </label>
            <Link
              href="/site/catalog"
              target="_blank"
              className="text-sm underline"
            >
              Open catalog ↗
            </Link>
            <p className="text-sm text-muted-foreground">
              Public address: /site/catalog. Add this address as a custom link
              in your header or footer menu.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(
              [
                ["search", "Search"],
                ["categories", "Categories"],
                ["availability", "In stock only"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => update({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
            <p className="text-sm text-muted-foreground">
              Attribute filters use values from published products.
            </p>
            {attributes.map((name) => (
              <label key={name} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.attributes.includes(name)}
                  onChange={(e) =>
                    update({
                      attributes: e.target.checked
                        ? [...settings.attributes, name]
                        : settings.attributes.filter((a) => a !== name),
                    })
                  }
                />
                {name}
              </label>
            ))}
            {!attributes.length && (
              <p className="text-sm">
                Add attributes to a published product to create more filters.
              </p>
            )}
          </CardContent>
        </Card>
      </fieldset>
    </div>
  );
}
