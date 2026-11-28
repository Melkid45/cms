"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectOption } from "@/components/ui/select";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { withSite } from "@/lib/builder/site-client";
import { AdminPanel } from "@/components/admin/admin-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CatalogImport } from "@/components/admin/catalog/catalog-import";
import {
  catalogFetch,
  productHref,
  useCatalog,
} from "@/components/admin/catalog/use-catalog";
import {
  availableQty,
  productName,
  STOCK,
  STOCK_LABELS,
  type Product,
  type Stock,
} from "@/lib/builder/products/shared";

// Products of the selected website. Price, stock and visibility change right in the list;
// the website's product pages, catalogue grid and cards follow on the next page load.
type Panel = "" | "import";
const field =
  "h-8 rounded-md bg-neutral-100 px-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-neutral-300";
export default function CatalogPage() {
  const router=useRouter();
  const { data, setData, error, setError, reload } = useCatalog();
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [stock, setStock] = useState<Stock | "hidden" | "">(""),
    [panel, setPanel] = useState<Panel>(""),
    [busy, setBusy] = useState(""),
    [drafts, setDrafts] = useState<
      Record<string, { price?: string; oldPrice?: string; qty?: string }>
    >({});
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
          Object.values(p.text).some(
            (t) =>
              t && (t.name.toLowerCase().includes(q) || t.slug.includes(q)),
          )),
    );
  }, [products, query, category, stock]);
  const categories = [
    ...new Set(
      [
        ...(data?.catalog.settings.categories || []),
        ...(products || []).map((p) => p.category),
      ].filter(Boolean),
    ),
  ];
  const replace = (next: Product) =>
    setData(
      (d) =>
        d && {
          ...d,
          catalog: {
            ...d.catalog,
            products: d.catalog.products.map((p) =>
              p.id === next.id ? next : p,
            ),
          },
        },
    );
  async function patch(
    product: Product,
    change: Partial<
      Pick<Product, "price" | "oldPrice" | "stock" | "qty" | "hidden">
    >,
  ) {
    setBusy(product.id);
    setError("");
    try {
      replace(
        await catalogFetch<Product>("/api/builder/catalog", {
          method: "PATCH",
          body: JSON.stringify({
            id: product.id,
            revision: product.revision,
            ...change,
          }),
        }),
      );
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
  async function bulk(change: { hidden?: boolean; category?: string }) {
    setBusy("bulk");
    setError("");
    let done = 0;
    try {
      for (const p of products || [])
        if (selected.includes(p.id)) {
          await catalogFetch("/api/builder/catalog", {
            method: "PATCH",
            body: JSON.stringify({ id: p.id, revision: p.revision, ...change }),
          });
          done++;
        }
      setSelected([]);
    } catch (e) {
      setError(
        `${done} updated. ${e instanceof Error ? e.message : "Could not save."}`,
      );
    } finally {
      await reload();
      setBusy("");
    }
  }
  async function duplicate(p: Product) {
    setBusy(p.id);
    setError("");
    try {
      const text = Object.fromEntries(
        Object.entries(p.text).map(([locale, t]) => {
          if (!t) return [locale, t];
          const base = `${t.slug}-copy`;
          let slug = base,
            n = 2;
          const used = new Set(
            (products || []).flatMap((p) =>
              Object.values(p.text).map((t) => t?.slug),
            ),
          );
          while (used.has(slug)) slug = `${base}-${n++}`;
          return [locale, { ...t, name: `${t.name} (copy)`, slug }];
        }),
      );
      const copy = await catalogFetch<Product>("/api/builder/catalog", {
        method: "POST",
        body: JSON.stringify({
          ...p,
          sku: "",
          hidden: true,
          pages: {},
          text,
          variants: p.variants?.map((v) => ({
            ...v,
            id: crypto.randomUUID(),
            sku: "",
            reserved: 0,
          })),
        }),
      });
      await reload();
      router.push(`/dashboard/shop/products/${copy.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not duplicate.");
    } finally {
      setBusy("");
    }
  }
  // Price fields save on Enter or when leaving the field.
  function commit(product: Product, key: "price" | "oldPrice" | "qty") {
    const raw = drafts[product.id]?.[key];
    if (raw === undefined) return;
    const value = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (value !== null && (!Number.isFinite(value) || value < 0))
      return setError("Enter a number.");
    if (key === "price" && value === null)
      return setError("A product needs a price.");
    if (value === (key === "price" ? product.price : product[key])) return;
    void patch(product, {
      [key]: key === "qty" && value !== null ? Math.round(value) : value,
    });
  }
  async function remove(product: Product) {
    if (
      !confirm(
        `Delete "${productName(product, locale)}"? Its pages stop being public and its cards disappear.`,
      )
    )
      return;
    setBusy(product.id);
    try {
      await catalogFetch("/api/builder/catalog", {
        method: "DELETE",
        body: JSON.stringify({ ids: [product.id] }),
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy("");
    }
  }
  return (
    <AdminPanel
      title="Products"
      toolbar={
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setPanel(panel === "import" ? "" : "import")}
              >
                <Upload />
                Import
              </Button>
              {/* The site id is known only in the browser: the address is built on click. */}
              <Button
                variant="outline"
                onClick={() =>
                  location.assign(withSite("/api/builder/catalog/export"))
                }
              >
                <Download />
                Export CSV
              </Button>
              <Link href="/dashboard/shop/products/new">
                <Button tabIndex={-1}>
                  <Plus />
                  Add product
                </Button>
              </Link>
            </div>
          }
        </div>
      }
    >
      {data && panel === "import" && (
        <CatalogImport
          onDone={() => {
            void reload();
          }}
          onClose={() => setPanel("")}
        />
      )}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutral-400" />
          <Input
            aria-label="Search products"
            className="pl-8"
            placeholder="Search by name, SKU or address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select
          aria-label="Category"
          className="h-9 w-full sm:w-44"
          value={String(category)}
          onValueChange={(selectedValue) => setCategory(selectedValue)}
        >
          <SelectOption value="">All categories</SelectOption>
          {categories.map((c) => (
            <SelectOption key={c} value={String(c)}>
              {c}
            </SelectOption>
          ))}
        </Select>
        <Select
          aria-label="Stock"
          className="h-9 w-full sm:w-44"
          value={String(stock)}
          onValueChange={(selectedValue) =>
            setStock(selectedValue as Stock | "hidden" | "")
          }
        >
          <SelectOption value="">Any stock</SelectOption>
          {STOCK.map((s) => (
            <SelectOption key={s} value={String(s)}>
              {STOCK_LABELS[s]}
            </SelectOption>
          ))}
          <SelectOption value="hidden">Hidden</SelectOption>
        </Select>
        <span className="text-sm text-neutral-500">
          {shown.length} of {products?.length ?? 0}
        </span>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-red-600">
          {error}
        </p>
      )}
      <div aria-label="Product bulk actions" className="mb-4 flex min-h-16 flex-wrap items-center gap-2 rounded-xl bg-neutral-100 p-3">
          <span className="mr-2 min-w-24 rounded-lg bg-white px-3 py-2 text-sm font-medium tabular-nums">
            {selected.length} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || selected.length === 0}
            onClick={() => void bulk({ hidden: false })}
          >
            Show
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || selected.length === 0}
            onClick={() => void bulk({ hidden: true })}
          >
            Hide
          </Button>
          <div className="w-48">
            <Input
              disabled={!!busy || selected.length === 0}
              aria-label="Category for selected products"
              placeholder="Category"
              list="bulk-categories"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            />
            <datalist id="bulk-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || selected.length === 0 || !bulkCategory.trim()}
            onClick={() => void bulk({ category: bulkCategory.trim() })}
          >
            Apply category
          </Button>
          <Button className="ml-auto" size="sm" variant="ghost" disabled={!!busy || selected.length === 0} onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="w-10 px-3">
                <Checkbox
                  aria-label="Select visible products"
                  checked={
                    shown.length > 0 &&
                    shown.every((p) => selected.includes(p.id))
                  }
                  onCheckedChange={(checked) =>
                    setSelected(
                      checked
                        ? [...new Set([...selected, ...shown.map((p) => p.id)])]
                        : selected.filter(
                            (id) => !shown.some((p) => p.id === id),
                          ),
                    )
                  }
                />
              </th>
              <th className="px-4 py-3 font-normal">Product</th>
              <th className="px-2 py-3 font-normal">Price</th>
              <th className="px-2 py-3 font-normal">Old price</th>
              <th className="px-2 py-3 font-normal">Stock</th>
              <th className="px-2 py-3 font-normal">On hand</th>
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
                  <td className="px-3">
                    <Checkbox
                      aria-label={`Select ${productName(p, locale)}`}
                      checked={selected.includes(p.id)}
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked
                            ? [...selected, p.id]
                            : selected.filter((id) => id !== p.id),
                        )
                      }
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      {p.images[0] ? (
                        <img
                          src={`${p.images[0]}${p.images[0].includes("?") ? "&" : "?"}w=320`}
                          alt=""
                          className="size-11 shrink-0 rounded-md bg-neutral-100 object-contain"
                        />
                      ) : (
                        <span className="size-11 shrink-0 rounded-md bg-neutral-100" title="No photo" />
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/shop/products/${p.id}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {productName(p, locale)}
                        </Link>
                        <span className="text-xs text-neutral-500">
                          {[
                            p.sku && `SKU ${p.sku}`,
                            p.category,
                            !p.images.length && !p.variants?.some(v=>v.images.length) && "No photo",
                            p.variants?.length && p.variants.every(v=>v.hidden||v.stock==="out_of_stock"||(v.stock!=="to_order"&&availableQty(v)===0)) && "No available variants",
                            Object.keys(p.text).join(" · ").toUpperCase(),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Price of ${productName(p, locale)}`}
                      inputMode="decimal"
                      className={`${field} w-24`}
                      value={
                        p.variants?.length
                          ? String(Math.min(...p.variants.map((v) => v.price)))
                          : (draft.price ?? String(p.price))
                      }
                      disabled={busy === p.id || !!p.variants?.length}
                      onChange={(e) =>
                        setDrafts((all) => ({
                          ...all,
                          [p.id]: { ...all[p.id], price: e.target.value },
                        }))
                      }
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
                      value={
                        draft.oldPrice ??
                        (p.oldPrice == null ? "" : String(p.oldPrice))
                      }
                      disabled={busy === p.id || !!p.variants?.length}
                      onChange={(e) =>
                        setDrafts((all) => ({
                          ...all,
                          [p.id]: { ...all[p.id], oldPrice: e.target.value },
                        }))
                      }
                      onBlur={() => commit(p, "oldPrice")}
                      onKeyDown={(e) =>
                        e.key === "Enter" && commit(p, "oldPrice")
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      aria-label={`Stock of ${productName(p, locale)}`}
                      className="h-9 "
                      value={String(p.stock)}
                      disabled={busy === p.id || !!p.variants?.length}
                      onValueChange={(selectedValue) =>
                        void patch(p, { stock: selectedValue as Stock })
                      }
                    >
                      {STOCK.map((s) => (
                        <SelectOption key={s} value={String(s)}>
                          {STOCK_LABELS[s]}
                        </SelectOption>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      disabled={busy === p.id || !!p.variants?.length}
                      aria-label={`Quantity of ${productName(p, locale)}`}
                      inputMode="numeric"
                      placeholder="—"
                      className={`${field} w-16`}
                      value={draft.qty ?? (p.qty == null ? "" : String(p.qty))}
                      onChange={(e) =>
                        setDrafts((all) => ({
                          ...all,
                          [p.id]: { ...all[p.id], qty: e.target.value },
                        }))
                      }
                      onBlur={() => commit(p, "qty")}
                      onKeyDown={(e) => e.key === "Enter" && commit(p, "qty")}
                    />
                    <p className="mt-1 whitespace-nowrap text-xs text-neutral-500">
                      {p.variants?.length
                        ? `${p.variants.length} variations`
                        : `${p.reserved || 0} reserved · ${availableQty(p) ?? "∞"} free`}
                    </p>
                  </td>
                  <td className="px-2 py-2">
                    <Switch
                      aria-label={`Show ${productName(p, locale)} on the website`}
                      checked={!p.hidden}
                      disabled={busy === p.id}
                      onCheckedChange={(checked) =>
                        void patch(p, { hidden: !checked })
                      }
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {href && !p.hidden && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${productName(p, locale)} on the website`}
                        >
                          <Button size="icon-sm" variant="ghost" tabIndex={-1}>
                            <ExternalLink />
                          </Button>
                        </a>
                      )}
                      <Link
                        href={`/dashboard/shop/products/${p.id}`}
                        aria-label={`Edit ${productName(p, locale)}`}
                      >
                        <Button size="icon-sm" variant="ghost" tabIndex={-1}>
                          <Pencil />
                        </Button>
                      </Link>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Duplicate ${productName(p, locale)}`}
                        title="Duplicate product"
                        disabled={!!busy}
                        onClick={() => void duplicate(p)}
                      >
                        <Copy />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${productName(p, locale)}`}
                        disabled={busy === p.id}
                        onClick={() => void remove(p)}
                      >
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
            {products?.length
              ? "No products match."
              : "No products yet. Add one or import a CSV/XLSX file."}
          </p>
        )}
        {!data && !error && (
          <p className="p-6 text-sm text-neutral-500">Loading…</p>
        )}
      </div>
    </AdminPanel>
  );
}
