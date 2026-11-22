"use client";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIMITS, type CatalogSettings } from "@/lib/builder/products/shared";
import { catalogFetch, type CatalogData } from "./use-catalog";

// Template pages, filter groups, price format, "included" label, categories (design roles).
export function CatalogSettingsPanel({
  data,
  onSaved,
  onClose,
}: {
  data: CatalogData;
  onSaved: (settings: CatalogSettings) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<CatalogSettings>(data.catalog.settings),
    [categories, setCategories] = useState(data.catalog.settings.categories.join(", ")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { ...s, categories: categories.split(",").map((c) => c.trim()).filter(Boolean) };
      onSaved(await catalogFetch<CatalogSettings>("/api/builder/catalog/settings", { method: "PUT", body: JSON.stringify(body) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const label = "mb-1 block text-xs text-neutral-500";
  return (
    <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex-1">
          <h2 className="font-medium">Catalogue settings</h2>
          <p className="mt-1 text-sm text-neutral-500">How products appear on the website.</p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Close settings" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-medium">Product page template</h3>
          <p className="mb-3 text-xs text-neutral-500">Products without their own page get a page with the blocks of this one (per language).</p>
          {data.locales.map((l) => (
            <label key={l} className="mb-2 flex items-center gap-3 text-sm">
              <span className="w-8 uppercase text-neutral-500">{l}</span>
              <select
                className="h-8 flex-1 rounded-md bg-neutral-100 px-2"
                value={s.templates[l as keyof CatalogSettings["templates"]] || ""}
                onChange={(e) => setS({ ...s, templates: { ...s.templates, [l]: e.target.value } })}
              >
                <option value="">First product page of this language</option>
                {data.productPages
                  .filter((p) => p.locale === l)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (/{p.slug})
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <div>
          <h3 className="mb-1 text-sm font-medium">Filters</h3>
          <p className="mb-3 text-xs text-neutral-500">
            Up to {LIMITS.filters} groups, in the order of the catalogue&apos;s filter groups. Chips are made from the products&apos; values; the group titles stay as written on the page.
          </p>
          {s.filters.map((f, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <Input aria-label="Filter key" placeholder="key, e.g. cpu" value={f.key} onChange={(e) => setS({ ...s, filters: s.filters.map((x, j) => (j === i ? { ...x, key: e.target.value.toLowerCase() } : x)) })} />
              <Input aria-label="Filter name" placeholder="Name in the admin" value={f.label} onChange={(e) => setS({ ...s, filters: s.filters.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <Button size="icon" variant="ghost" aria-label="Remove filter" onClick={() => setS({ ...s, filters: s.filters.filter((_, j) => j !== i) })}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {s.filters.length < LIMITS.filters && (
            <Button size="sm" variant="outline" onClick={() => setS({ ...s, filters: [...s.filters, { key: "", label: "" }] })}>
              <Plus />
              Add filter
            </Button>
          )}
        </div>
        <div>
          <label className={label} htmlFor="cat-price-format">
            Price format ({"{n}"} = number)
          </label>
          <Input id="cat-price-format" value={s.priceFormat} onChange={(e) => setS({ ...s, priceFormat: e.target.value })} />
          <label className={`${label} mt-4`} htmlFor="cat-categories">
            Categories (comma separated)
          </label>
          <Input id="cat-categories" value={categories} onChange={(e) => setCategories(e.target.value)} />
        </div>
        <div>
          <span className={label}>Option without surcharge is shown as</span>
          {data.locales.map((l) => (
            <label key={l} className="mb-2 flex items-center gap-3 text-sm">
              <span className="w-8 uppercase text-neutral-500">{l}</span>
              <Input
                value={s.includedLabel[l as keyof CatalogSettings["includedLabel"]] || ""}
                placeholder="Included"
                onChange={(e) => setS({ ...s, includedLabel: { ...s.includedLabel, [l]: e.target.value } })}
              />
            </label>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <Button className="mt-5" disabled={busy} onClick={() => void save()}>
        Save settings
      </Button>
    </section>
  );
}
