"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, ExternalLink, Pencil, Plus, Search, Settings2, Trash2, Upload } from "lucide-react";
import { withSite } from "@/lib/builder/site-client";
import { useAccess } from "@/components/admin/access-context";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CatalogImport } from "@/components/admin/catalog/catalog-import";
import { CatalogSettingsPanel } from "@/components/admin/catalog/catalog-settings";
import { catalogFetch, productHref, useCatalog } from "@/components/admin/catalog/use-catalog";
import { formatPrice, productName, STOCK, STOCK_LABELS, type Product, type Stock } from "@/lib/builder/products/shared";

// Products of the selected website. Price, stock and visibility change right in the list;
// the website's product pages, catalogue grid and cards follow on the next page load.
type Panel = "" | "import" | "settings";
const field = "h-8 rounded-md bg-neutral-100 px-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-neutral-300";
export default function CatalogPage() {
  const { canDesign } = useAccess();
  const { data, setData, error, setError, reload } = useCatalog();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [stock, setStock] = useState<Stock | "hidden" | "">(""),
    [panel, setPanel] = useState<Panel>(""),
    [busy, setBusy] = useState(""),
    [drafts, setDrafts] = useState<Record<string, { price?: string; oldPrice?: string; qty?: string }>>({});
  const locale = data?.locales[0] || "en";
  const products = data?.catalog.products;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products || []).filter(
      (p) =>
        (!category || p.category === category) &&
        (!stock || (stock === "hidden" ? p.hidden : p.stock === stock)) &&
        (!q ||
          p.sku.toLowerCase().includes(q) ||
          Object.values(p.text).some((t) => t && (t.name.toLowerCase().includes(q) || t.slug.includes(q)))),
    );
  }, [products, query, category, stock]);
  const categories = [...new Set([...(data?.catalog.settings.categories || []), ...(products || []).map((p) => p.category)].filter(Boolean))];
  const replace = (next: Product) =>
    setData((d) => d && { ...d, catalog: { ...d.catalog, products: d.catalog.products.map((p) => (p.id === next.id ? next : p)) } });
  async function patch(product: Product, change: Partial<Pick<Product, "price" | "oldPrice" | "stock" | "qty" | "hidden">>) {
    setBusy(product.id);
    setError("");
    try {
      replace(await catalogFetch<Product>("/api/builder/catalog", { method: "PATCH", body: JSON.stringify({ id: product.id, revision: product.revision, ...change }) }));
      setDrafts((all) => {
        const next = { ...all };
        delete next[product.id];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }
  // Price fields save on Enter or when leaving the field.
  function commit(product: Product, key: "price" | "oldPrice" | "qty") {
    const raw = drafts[product.id]?.[key];
    if (raw === undefined) return;
    const value = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (value !== null && (!Number.isFinite(value) || value < 0)) return setError("Enter a number.");
    if (key === "price" && value === null) return setError("A product needs a price.");
    if (value === (key === "price" ? product.price : product[key])) return;
    void patch(product, { [key]: key === "qty" && value !== null ? Math.round(value) : value });
  }
  async function remove(product: Product) {
    if (!confirm(`Delete "${productName(product, locale)}"? Its pages stop being public and its cards disappear.`)) return;
    setBusy(product.id);
    try {
      await catalogFetch("/api/builder/catalog", { method: "DELETE", body: JSON.stringify({ ids: [product.id] }) });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy("");
    }
  }
  return (
    <AdminPanel
      title="Catalog"
      toolbar={<div className="ml-auto flex flex-wrap items-center gap-2.5">{
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPanel(panel === "import" ? "" : "import")}>
              <Upload />
              Import
            </Button>
            {/* The site id is known only in the browser: the address is built on click. */}
            <Button variant="outline" onClick={() => location.assign(withSite("/api/builder/catalog/export"))}>
              <Download />
              Export CSV
            </Button>
            {canDesign && (
              <Button variant="outline" onClick={() => setPanel(panel === "settings" ? "" : "settings")}>
                <Settings2 />
                Settings
              </Button>
            )}
            <Link href="/dashboard/catalog/new">
              <Button tabIndex={-1}>
                <Plus />
                Add product
              </Button>
            </Link>
          </div>
        }</div>}
    >
      {data && panel === "import" && (
        <CatalogImport
          onDone={() => {
            void reload();
          }}
          onClose={() => setPanel("")}
        />
      )}
      {data && panel === "settings" && (
        <CatalogSettingsPanel
          data={data}
          onSaved={(settings) => {
            setData((d) => d && { ...d, catalog: { ...d.catalog, settings } });
            setPanel("");
          }}
          onClose={() => setPanel("")}
        />
      )}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutral-400" />
          <Input aria-label="Search products" className="pl-8" placeholder="Search by name, SKU or address" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select aria-label="Category" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Stock" className={field} value={stock} onChange={(e) => setStock(e.target.value as Stock | "hidden" | "")}>
          <option value="">Any stock</option>
          {STOCK.map((s) => (
            <option key={s} value={s}>
              {STOCK_LABELS[s]}
            </option>
          ))}
          <option value="hidden">Hidden</option>
        </select>
        <span className="text-sm text-neutral-500">
          {shown.length} of {products?.length ?? 0}
        </span>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-red-600">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-normal">Product</th>
              <th className="px-2 py-3 font-normal">Price</th>
              <th className="px-2 py-3 font-normal">Old price</th>
              <th className="px-2 py-3 font-normal">Stock</th>
              <th className="px-2 py-3 font-normal">Qty</th>
              <th className="px-2 py-3 font-normal">On site</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => {
              const draft = drafts[p.id] || {};
              const href = data ? productHref(data, p, locale) : "";
              return (
                <tr key={p.id} className={i % 2 ? "" : "bg-neutral-50/70"}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      {p.images[0] ? (
                        <img src={`${p.images[0]}${p.images[0].includes("?") ? "&" : "?"}w=320`} alt="" className="size-11 shrink-0 rounded-md bg-neutral-100 object-contain" />
                      ) : (
                        <span className="size-11 shrink-0 rounded-md bg-neutral-100" />
                      )}
                      <div className="min-w-0">
                        <Link href={`/dashboard/catalog/${p.id}`} className="block truncate font-medium hover:underline">
                          {productName(p, locale)}
                        </Link>
                        <span className="text-xs text-neutral-500">
                          {[p.sku && `SKU ${p.sku}`, p.category, Object.keys(p.text).join(" · ").toUpperCase()].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Price of ${productName(p, locale)}`}
                      inputMode="decimal"
                      className={`${field} w-24`}
                      value={draft.price ?? String(p.price)}
                      disabled={busy === p.id}
                      onChange={(e) => setDrafts((all) => ({ ...all, [p.id]: { ...all[p.id], price: e.target.value } }))}
                      onBlur={() => commit(p, "price")}
                      onKeyDown={(e) => e.key === "Enter" && commit(p, "price")}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Old price of ${productName(p, locale)}`}
                      inputMode="decimal"
                      placeholder="—"
                      className={`${field} w-24`}
                      value={draft.oldPrice ?? (p.oldPrice == null ? "" : String(p.oldPrice))}
                      disabled={busy === p.id}
                      onChange={(e) => setDrafts((all) => ({ ...all, [p.id]: { ...all[p.id], oldPrice: e.target.value } }))}
                      onBlur={() => commit(p, "oldPrice")}
                      onKeyDown={(e) => e.key === "Enter" && commit(p, "oldPrice")}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      aria-label={`Stock of ${productName(p, locale)}`}
                      className={field}
                      value={p.stock}
                      disabled={busy === p.id}
                      onChange={(e) => void patch(p, { stock: e.target.value as Stock })}
                    >
                      {STOCK.map((s) => (
                        <option key={s} value={s}>
                          {STOCK_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Quantity of ${productName(p, locale)}`}
                      inputMode="numeric"
                      placeholder="—"
                      className={`${field} w-16`}
                      value={draft.qty ?? (p.qty == null ? "" : String(p.qty))}
                      disabled={busy === p.id}
                      onChange={(e) => setDrafts((all) => ({ ...all, [p.id]: { ...all[p.id], qty: e.target.value } }))}
                      onBlur={() => commit(p, "qty")}
                      onKeyDown={(e) => e.key === "Enter" && commit(p, "qty")}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Switch
                      aria-label={`Show ${productName(p, locale)} on the website`}
                      checked={!p.hidden}
                      disabled={busy === p.id}
                      onCheckedChange={(checked) => void patch(p, { hidden: !checked })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {href && !p.hidden && (
                        <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${productName(p, locale)} on the website`}>
                          <Button size="icon-sm" variant="ghost" tabIndex={-1}>
                            <ExternalLink />
                          </Button>
                        </a>
                      )}
                      <Link href={`/dashboard/catalog/${p.id}`} aria-label={`Edit ${productName(p, locale)}`}>
                        <Button size="icon-sm" variant="ghost" tabIndex={-1}>
                          <Pencil />
                        </Button>
                      </Link>
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${productName(p, locale)}`} disabled={busy === p.id} onClick={() => void remove(p)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && !shown.length && (
          <p className="p-12 text-center text-sm text-neutral-500">
            {products?.length ? "No products match." : "No products yet. Add one or import a CSV/XLSX file."}
          </p>
        )}
        {!data && !error && <p className="p-6 text-sm text-neutral-500">Loading…</p>}
      </div>
      {data && <p className="mt-3 text-xs text-neutral-500">Prices in EUR, e.g. {formatPrice(1199, data.catalog.settings.priceFormat)}. Changes are live on the website at once.</p>}
    </AdminPanel>
  );
}
