"use client";
import { ProductVariantsEditor } from "./product-variants";
import { Select, SelectOption } from "@/components/ui/select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useAccess } from "@/components/admin/access-context";
import { PageHeader } from "@/components/admin/page-header";
import { MediaPicker } from "@/components/builder/media-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyText,
  LIMITS,
  productName,
  slugify,
  STOCK,
  STOCK_LABELS,
  type Product,
  type ProductOption,
  type ProductVariant,
  availableQty,
  type ProductText,
  type Spec,
  type Stock,
} from "@/lib/builder/products/shared";
import { catalogFetch, productHref, useCatalog } from "./use-catalog";

type Texts = Record<string, ProductText>;
interface Draft {
  variants: ProductVariant[];
  sku: string;
  category: string;
  price: string;
  oldPrice: string;
  stock: Stock;
  qty: string;
  images: string[];
  hidden: boolean;
  filters: Record<string, string>;
  options: ProductOption[];
  text: Texts;
  pages: Record<string, string>;
}
const toDraft = (p: Product | undefined, locales: string[]): Draft => ({
  variants: p?.variants ?? [],
  sku: p?.sku ?? "",
  category: p?.category ?? "",
  price: p ? String(p.price) : "",
  oldPrice: p?.oldPrice == null ? "" : String(p.oldPrice),
  stock: p?.stock ?? "in_stock",
  qty: p?.qty == null ? "" : String(p.qty),
  images: p?.images ?? [],
  hidden: p?.hidden ?? false,
  filters: p?.filters ?? {},
  options: p?.options ?? [],
  text: Object.fromEntries(
    locales.map((l) => [
      l,
      { ...emptyText(), ...p?.text[l as keyof Product["text"]] },
    ]),
  ),
  pages: { ...(p?.pages as Record<string, string>) },
});
const label = "mb-1 block text-xs text-neutral-500";
const card = "rounded-xl bg-white p-6 shadow-sm";
function SpecRows({
  title,
  hint,
  rows,
  max,
  onChange,
}: {
  title: string;
  hint: string;
  rows: Spec[];
  max: number;
  onChange: (rows: Spec[]) => void;
}) {
  const list = rows.length ? rows : [{ key: "", value: "" }];
  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="mb-2 text-xs text-neutral-500">{hint}</p>
      {list.map((row, i) => (
        <div key={i} className="mb-1.5 flex gap-2">
          <Input
            aria-label={`${title} ${i + 1} label`}
            placeholder="Label"
            className="w-2/5"
            value={row.key}
            onChange={(e) =>
              onChange(
                list.map((r, j) =>
                  j === i ? { ...r, key: e.target.value } : r,
                ),
              )
            }
          />
          <Input
            aria-label={`${title} ${i + 1} value`}
            placeholder="Value"
            value={row.value}
            onChange={(e) =>
              onChange(
                list.map((r, j) =>
                  j === i ? { ...r, value: e.target.value } : r,
                ),
              )
            }
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove row ${i + 1}`}
            onClick={() => onChange(list.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {list.length < max && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange([...list, { key: "", value: "" }])}
        >
          <Plus />
          Row
        </Button>
      )}
    </div>
  );
}
export function ProductForm({ id }: { id: string }) {
  const router = useRouter();
  const { canDesign } = useAccess();
  const { data, error: loadError, reload } = useCatalog();
  const product = data?.catalog.products.find((p) => p.id === id);
  const [draft, setDraft] = useState<Draft | null>(null),
    [lang, setLang] = useState(""),
    [touched, setTouched] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  const isNew = id === "new";
  useEffect(() => {
    if (!data || draft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- form starts from the loaded product
    setDraft(toDraft(product, data.locales));
    setLang(data.locales[0]);
  }, [data, product, draft]);
  if (loadError) return <p className="text-red-600">{loadError}</p>;
  if (!data || !draft) return <p>Loading…</p>;
  if (!isNew && !product)
    return (
      <p>
        Product not found.{" "}
        <Link href="/dashboard/shop/products" className="underline">
          Back to the catalogue
        </Link>
      </p>
    );
  const t = draft.text[lang];
  const setText = (patch: Partial<ProductText>) =>
    setDraft({ ...draft, text: { ...draft.text, [lang]: { ...t, ...patch } } });
  const filters = data.catalog.settings.filters;
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const text = Object.fromEntries(
        Object.entries(draft.text).filter(
          ([, x]) => x.name.trim() || x.slug.trim() || x.summary.trim(),
        ),
      );
      const body = {
        variants: draft.variants,
        sku: draft.sku,
        category: draft.category,
        price: Number(draft.price.replace(",", ".")),
        oldPrice: draft.oldPrice.trim()
          ? Number(draft.oldPrice.replace(",", "."))
          : null,
        stock: draft.stock,
        qty: draft.qty.trim() ? Math.round(Number(draft.qty)) : null,
        images: draft.images.filter(Boolean),
        hidden: draft.hidden,
        filters: Object.fromEntries(
          Object.entries(draft.filters).filter(
            ([k, v]) => v.trim() && filters.some((f) => f.key === k),
          ),
        ),
        options: draft.options,
        text,
        pages: Object.fromEntries(
          Object.entries(draft.pages).filter(([, v]) => v),
        ),
      };
      if (!draft.price.trim() || !Number.isFinite(body.price))
        throw new Error("Enter the price.");
      const result = isNew
        ? await catalogFetch<Product>("/api/builder/catalog", {
            method: "POST",
            body: JSON.stringify(body),
          })
        : await catalogFetch<Product>("/api/builder/catalog", {
            method: "PUT",
            body: JSON.stringify({
              id,
              revision: product!.revision,
              product: body,
            }),
          });
      if (isNew) {
        router.replace(`/dashboard/shop/products/${result.id}`);
        return;
      }
      await reload();
      setDraft(null);
      setSaved("Saved. The website shows the changes now.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !product ||
      !confirm(
        `Delete "${productName(product, data!.locales[0])}"? Its pages stop being public and its cards disappear.`,
      )
    )
      return;
    setBusy(true);
    try {
      await catalogFetch("/api/builder/catalog", {
        method: "DELETE",
        body: JSON.stringify({ ids: [product.id] }),
      });
      router.push("/dashboard/shop/products");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
      setBusy(false);
    }
  }
  const option = (g: number, patch: Partial<ProductOption>) =>
    setDraft({
      ...draft,
      options: draft.options.map((o, i) => (i === g ? { ...o, ...patch } : o)),
    });
  return (
    <div className="min-w-0">
      <Link
        href="/dashboard/shop/products"
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" />
        Products
      </Link>
      <PageHeader
        title={isNew ? "New product" : productName(product!, data.locales[0])}
        action={
          <div className="flex flex-wrap gap-2">
            {!isNew &&
              data.locales.map((l) => {
                const href = productHref(data, product!, l);
                return href && !product!.hidden ? (
                  <a key={l} href={href} target="_blank" rel="noreferrer">
                    <Button variant="outline" tabIndex={-1}>
                      <ExternalLink />
                      {l.toUpperCase()}
                    </Button>
                  </a>
                ) : null;
              })}
            {!isNew && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 />
                Delete
              </Button>
            )}
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : isNew ? "Create product" : "Save"}
            </Button>
          </div>
        }
      />
      {error && (
        <p role="alert" className="mb-4 text-red-600">
          {error}
        </p>
      )}
      {saved && <p className="mb-4 text-green-700">{saved}</p>}
      <div className="space-y-5">
        <section className={`${card} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
          <div>
            <label className={label} htmlFor="p-price">
              {draft.variants.length?`Default price for new variations, ${data.currency||"EUR"}`:`Price, ${data.currency||"EUR"}`}
            </label>
            <Input
              id="p-price"
              inputMode="decimal"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
          </div>
          <div>
            <label className={label} htmlFor="p-old">
              Old price (crossed out)
            </label>
            <Input
              disabled={draft.variants.length>0}
              id="p-old"
              inputMode="decimal"
              value={draft.oldPrice}
              onChange={(e) => setDraft({ ...draft, oldPrice: e.target.value })}
            />
          </div>
          <div>
            <label className={label} htmlFor="p-stock">
              Stock
            </label>
            <Select
              disabled={draft.variants.length>0}
              id="p-stock"
              className="h-9 "
              value={String(draft.stock)}
              onValueChange={(selectedValue) =>
                setDraft({ ...draft, stock: selectedValue as Stock })
              }
            >
              {STOCK.map((s) => (
                <SelectOption key={s} value={String(s)}>
                  {STOCK_LABELS[s]}
                </SelectOption>
              ))}
            </Select>
          </div>
          <div>
            <label className={label} htmlFor="p-qty">
              On-hand quantity
            </label>
            <Input
              id="p-qty"
              disabled={draft.variants.length > 0}
              inputMode="numeric"
              placeholder="—"
              value={draft.qty}
              onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
            />
            <p className="mt-1 text-xs text-neutral-500">
              {draft.variants.length
                ? "Stock is managed per variation below."
                : `${product?.reserved || 0} reserved · ${product ? (availableQty(product) ?? "Unlimited") : "Unlimited"} available. Blank quantity means unlimited.`}
            </p>
          </div>
          <div>
            <label className={label} htmlFor="p-sku">
              SKU
            </label>
            <Input
              id="p-sku"
              value={draft.sku}
              onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
            />
          </div>
          <div>
            <label className={label} htmlFor="p-cat">
              Category
            </label>
            <Input
              id="p-cat"
              list="p-categories"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            />
            <datalist id="p-categories">
              {data.catalog.settings.categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          {filters.map((f) => (
            <div key={f.key}>
              <label className={label} htmlFor={`p-f-${f.key}`}>
                Filter: {f.label || f.key}
              </label>
              <Input
                id={`p-f-${f.key}`}
                value={draft.filters[f.key] || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    filters: { ...draft.filters, [f.key]: e.target.value },
                  })
                }
              />
            </div>
          ))}
          <label className="flex items-center gap-3 self-end pb-1 text-sm">
            <Switch
              checked={!draft.hidden}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, hidden: !checked })
              }
            />
            Shown on the website
          </label>
        </section>

        <section className={card}>
          <h3 className="mb-1 text-sm font-medium">Photos</h3>
          <p className="mb-3 text-xs text-neutral-500">
            From the media library; the first one is the main photo (up to{" "}
            {LIMITS.images}).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...draft.images, ""].slice(0, LIMITS.images).map((url, i) => (
              <MediaPicker
                key={i}
                value={url}
                label={i === 0 ? "Main photo" : "Add photo"}
                onChange={(next) => {
                  const images = draft.images.slice();
                  if (next) images[i] = next;
                  else images.splice(i, 1);
                  setDraft({ ...draft, images: images.filter(Boolean) });
                }}
              />
            ))}
          </div>
        </section>

        <section className={card}>
          <div className="mb-4 flex flex-wrap gap-1">
            {data.locales.map((l) => (
              <Button
                key={l}
                size="sm"
                variant={l === lang ? "secondary" : "ghost"}
                onClick={() => setLang(l)}
              >
                {l.toUpperCase()}
                {!draft.text[l]?.name && (
                  <span className="text-neutral-400"> · empty</span>
                )}
              </Button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="p-name">
                Name
              </label>
              <Input
                id="p-name"
                value={t.name}
                onChange={(e) =>
                  setText({
                    name: e.target.value,
                    ...(isNew && !touched[lang]
                      ? { slug: slugify(e.target.value) }
                      : {}),
                  })
                }
              />
            </div>
            <div>
              <label className={label} htmlFor="p-slug">
                Address (after the website address)
              </label>
              <Input
                id="p-slug"
                value={t.slug}
                onChange={(e) => {
                  setTouched({ ...touched, [lang]: true });
                  setText({
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-"),
                  });
                }}
              />
            </div>
            <div>
              <label className={label} htmlFor="p-sub">
                Line above the name
              </label>
              <Input
                id="p-sub"
                value={t.subtitle}
                onChange={(e) => setText({ subtitle: e.target.value })}
              />
            </div>
            <div>
              <label className={label} htmlFor="p-badge">
                Card badge
              </label>
              <Input
                id="p-badge"
                placeholder="e.g. Top"
                value={t.badge}
                onChange={(e) => setText({ badge: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="p-summary">
                Summary under the name
              </label>
              <Textarea
                id="p-summary"
                rows={2}
                value={t.summary}
                onChange={(e) => setText({ summary: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="p-desc">
                Description (search and SEO)
              </label>
              <Textarea
                id="p-desc"
                rows={3}
                value={t.description}
                onChange={(e) => setText({ description: e.target.value })}
              />
            </div>
            <div>
              <label className={label} htmlFor="p-alt">
                Photo description
              </label>
              <Input
                id="p-alt"
                placeholder={t.name}
                value={t.imageAlt}
                onChange={(e) => setText({ imageAlt: e.target.value })}
              />
            </div>
            <div>
              <label className={label} htmlFor="p-note">
                Line next to the price
              </label>
              <Input
                id="p-note"
                value={t.priceNote}
                onChange={(e) => setText({ priceNote: e.target.value })}
              />
            </div>
            <div>
              <label className={label} htmlFor="p-seo-t">
                SEO title
              </label>
              <Input
                id="p-seo-t"
                placeholder={t.name}
                value={t.seoTitle}
                onChange={(e) => setText({ seoTitle: e.target.value })}
              />
            </div>
            <div>
              <label className={label} htmlFor="p-seo-d">
                SEO description ({"{price}"} = current price)
              </label>
              <Input
                id="p-seo-d"
                placeholder={t.summary}
                value={t.seoDescription}
                onChange={(e) => setText({ seoDescription: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SpecRows
              title="Key facts"
              hint="Next to the photo on the product page."
              rows={t.topSpecs}
              max={LIMITS.topSpecs}
              onChange={(rows) => setText({ topSpecs: rows })}
            />
            <SpecRows
              title="Card facts"
              hint="On product cards in lists."
              rows={t.cardSpecs}
              max={LIMITS.cardSpecs}
              onChange={(rows) => setText({ cardSpecs: rows })}
            />
            <div className="lg:col-span-2">
              <SpecRows
                title="Specification"
                hint="Table on the product page."
                rows={t.specs}
                max={LIMITS.specs}
                onChange={(rows) => setText({ specs: rows })}
              />
            </div>
          </div>
          {canDesign && (
            <div className="mt-6">
              <label className={label} htmlFor="p-page">
                Page of this product ({lang.toUpperCase()})
              </label>
              <Select
                id="p-page"
                className="h-9 max-w-md"
                value={String(draft.pages[lang] || "")}
                onValueChange={(selectedValue) =>
                  setDraft({
                    ...draft,
                    pages: { ...draft.pages, [lang]: selectedValue },
                  })
                }
              >
                <SelectOption value="">
                  Built from the template page
                </SelectOption>
                {data.productPages
                  .filter((p) => p.locale === lang)
                  .map((p) => (
                    <SelectOption key={p.id} value={String(p.id)}>
                      {p.title} (/{p.slug})
                    </SelectOption>
                  ))}
              </Select>
            </div>
          )}
        </section>

        <ProductVariantsEditor
          variants={draft.variants}
          onChange={(variants) => setDraft({ ...draft, variants })}
          currency={data.currency||"EUR"} basePrice={Number(draft.price)}
        />
        <section className={card} hidden={draft.variants.length > 0}>
          <h3 className="mb-1 text-sm font-medium">Options with a surcharge</h3>
          <p className="mb-3 text-xs text-neutral-500">
            Up to {LIMITS.options} groups of {LIMITS.choices} choices on the
            product page; 0 = included. Names in every language; the surcharge
            is the same.
          </p>
          {draft.options.map((o, g) => (
            <div key={g} className="mb-4 rounded-lg bg-neutral-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  aria-label={`Option group ${g + 1} name`}
                  placeholder={`Group name (${lang.toUpperCase()})`}
                  value={o.label[lang as keyof ProductOption["label"]] || ""}
                  onChange={(e) =>
                    option(g, { label: { ...o.label, [lang]: e.target.value } })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove option group ${g + 1}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      options: draft.options.filter((_, i) => i !== g),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              {Array.from({ length: LIMITS.choices }, (_, c) => {
                const choice = o.choices[c] || { name: {}, delta: 0 };
                const setChoice = (next: typeof choice) => {
                  const choices = o.choices.slice();
                  choices[c] = next;
                  option(g, {
                    choices: choices.map((x) => x || { name: {}, delta: 0 }),
                  });
                };
                return (
                  <div key={c} className="mb-1.5 flex gap-2">
                    <Input
                      aria-label={`Choice ${c + 1} of group ${g + 1}`}
                      placeholder={`Choice ${c + 1}`}
                      value={
                        choice.name[lang as keyof typeof choice.name] || ""
                      }
                      onChange={(e) =>
                        setChoice({
                          ...choice,
                          name: { ...choice.name, [lang]: e.target.value },
                        })
                      }
                    />
                    <Input
                      aria-label={`Surcharge of choice ${c + 1} of group ${g + 1}`}
                      inputMode="decimal"
                      className="w-28"
                      value={String(choice.delta)}
                      onChange={(e) =>
                        setChoice({
                          ...choice,
                          delta: Number(e.target.value.replace(",", ".")) || 0,
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          ))}
          {draft.options.length < LIMITS.options && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraft({
                  ...draft,
                  options: [
                    ...draft.options,
                    { label: {}, choices: [{ name: {}, delta: 0 }] },
                  ],
                })
              }
            >
              <Plus />
              Option group
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
