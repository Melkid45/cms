"use client";
import { PaymentSettings } from "./payment-settings";
import { OperationalSettings } from "./operational-settings";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { AdminPanel } from "@/components/admin/admin-panel";
import { useAccess } from "@/components/admin/access-context";
import {
  useCatalog,
  catalogFetch,
  type CatalogData,
} from "@/components/admin/catalog/use-catalog";
import { CatalogSettingsPanel } from "@/components/admin/catalog/catalog-settings";
import { ShopSettings } from "@/components/admin/shop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogSettings } from "@/lib/builder/products/shared";

export default function ShopSettingsScreen() {
  const { canDesign, role } = useAccess();
  const [tab, setTab] = useState(role === "designer" ? "catalog" : "delivery");
  const { data, setData, error } = useCatalog();
  const saved = (settings: CatalogSettings) =>
    setData(
      (current) =>
        current && { ...current, catalog: { ...current.catalog, settings } },
    );
  const tabs = [
    ...(canDesign
      ? [
          { id: "catalog", label: "Catalog" },
          { id: "cart", label: "Cart" },
        ]
      : [{ id: "catalog", label: "Categories" }]),
    ...(role !== "designer"
      ? [
          { id: "delivery", label: "Delivery" },
          { id: "checkout", label: "Checkout" },
          { id: "payments", label: "Payments" },
        ]
      : []),
  ];
  return (
    <AdminPanel title="Shop settings">
      <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label="Shop settings"
          className="flex flex-wrap gap-1 rounded-xl border bg-white p-2 lg:sticky lg:top-6 lg:flex-col"
        >
          {tabs.map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? "secondary" : "ghost"}
              className="justify-start"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </nav>
        <div className="min-w-0 rounded-xl border bg-white p-5 sm:p-6">
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600">
              {error}
            </p>
          )}
          <div hidden={tab !== "catalog"}>
            {!data ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : canDesign ? (
              <CatalogSettingsPanel data={data} onSaved={saved} />
            ) : (
              <ClientCategories
                data={data}
                onSaved={(settings, revision) =>
                  setData(
                    (current) =>
                      current && {
                        ...current,
                        catalog: { ...current.catalog, settings, revision },
                      },
                  )
                }
              />
            )}
          </div>
          {canDesign && (
            <div hidden={tab !== "cart"}>
              <ShopSettings />
            </div>
          )}
          {role !== "designer" && (
            <>
              <div hidden={tab !== "delivery" && tab !== "checkout"}>
                <OperationalSettings
                  group={tab === "checkout" ? "checkout" : "delivery"}
                />
              </div>
              <div hidden={tab !== "payments"}>
                <PaymentSettings />
              </div>
            </>
          )}
        </div>
      </div>
    </AdminPanel>
  );
}
function ClientCategories({
  data,
  onSaved,
}: {
  data: CatalogData;
  onSaved: (settings: CatalogSettings, revision: number) => void;
}) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const categories = draft ?? data.catalog.settings.categories;
  const add = () => {
    const next = name.trim();
    if (!next || categories.includes(next) || categories.length >= 100) return;
    setDraft([...categories, next]);
    setName("");
    setMessage("");
  };
  return (
    <section className="max-w-2xl space-y-5">
      <div>
        <h2 className="font-semibold">Product categories</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Create categories here, then choose one when editing a product.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="shop-category">New category</Label>
        <div className="flex gap-2">
          <Input
            id="shop-category"
            placeholder="e.g. Lighting"
            maxLength={100}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={
              busy ||
              !name.trim() ||
              categories.length >= 100 ||
              categories.includes(name.trim())
            }
            onClick={add}
          >
            <Plus />
            Add
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <span
            key={category}
            className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 py-1 pl-3 pr-1 text-sm"
          >
            {category}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove category ${category}`}
              disabled={busy}
              onClick={() => {
                setDraft(categories.filter((item) => item !== category));
                setMessage("");
              }}
            >
              <X className="size-3.5" />
            </Button>
          </span>
        ))}
        {!categories.length && (
          <p className="text-sm text-neutral-500">No categories yet.</p>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Removing a category from this list does not delete its products.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          disabled={busy || draft === null}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const result = await catalogFetch<{
                settings: CatalogSettings;
                revision: number;
              }>("/api/builder/catalog/settings", {
                method: "PATCH",
                body: JSON.stringify({
                  categories,
                  revision: data.catalog.revision,
                }),
              });
              onSaved(result.settings, result.revision);
              setDraft(null);
              setMessage("Categories saved.");
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "Could not save categories.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save categories"}
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </section>
  );
}
