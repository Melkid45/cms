"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Save,
  Trash2,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { MediaPicker } from "@/components/builder/media-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { safeUrl } from "@/lib/builder/catalog";
import { productSlug, type Product } from "@/lib/shop/types";

const tabs = ["General", "Images", "Inventory", "Attributes", "SEO"];
const split = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <h2 className="border-b px-5 py-4 text-sm font-semibold">{title}</h2>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function decimal(value: string) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value))
    throw Error("Enter a valid price with up to two decimal places.");
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function ProductEditor({ initial }: { initial: Product }) {
  const router = useRouter();
  const [product, setProduct] = useState(initial);
  const [tab, setTab] = useState("General");
  const [price, setPrice] = useState((initial.price / 100).toFixed(2));
  const [sale, setSale] = useState(
    initial.salePrice === null ? "" : (initial.salePrice / 100).toFixed(2),
  );
  const [categories, setCategories] = useState(initial.categories.join(", "));
  const [attributes, setAttributes] = useState(
    initial.attributes.map((attribute) => ({
      name: attribute.name,
      values: attribute.values.join(", "),
    })),
  );
  const snapshot = JSON.stringify({
    product,
    price,
    sale,
    categories,
    attributes,
  });
  const [saved, setSaved] = useState(snapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = snapshot !== saved;
  useEffect(() => {
    if (!dirty) return;
    const before = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      const target = (event.target as Element).closest("a");
      if (
        !target ||
        target.target === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      if (target.href === location.href) return;
      if (!window.confirm("Leave without saving product changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => {
      removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  function patch(value: Partial<Product>) {
    setProduct((current) => ({ ...current, ...value }));
    setNotice("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const value: Product = {
        ...product,
        slug: product.slug || productSlug(product.name),
        price: decimal(price),
        salePrice: sale.trim() ? decimal(sale) : null,
        categories: split(categories),
        attributes: attributes.map((attribute) => ({
          name: attribute.name,
          values: split(attribute.values),
        })),
      };
      const response = await fetch("/api/shop/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not save product.");
      const stored = result as Product;
      setProduct(stored);
      setSaved(
        JSON.stringify({
          product: stored,
          price,
          sale,
          categories,
          attributes,
        }),
      );
      setNotice("Product saved.");
      if (!initial.revision)
        router.replace(`/dashboard/shop/products/${stored.id}`);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save product.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <Link
        className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-black"
        href="/dashboard/shop"
      >
        <ArrowLeft className="size-4" /> All products
      </Link>
      <PageHeader
        title={
          initial.revision ? product.name || "Edit product" : "Add product"
        }
        description="Product details, pricing and inventory."
        action={
          <Button type="submit" disabled={busy}>
            <Save /> {busy ? "Saving…" : "Save product"}
          </Button>
        }
      />
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-5 text-sm">
          {notice}
        </p>
      )}
      <fieldset
        disabled={busy}
        className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div className="min-w-0 space-y-5">
          <div className="rounded-xl border bg-white p-5">
            <Field label="Product name">
              <Input
                required
                maxLength={200}
                value={product.name}
                placeholder="e.g. Alder dining chair"
                onChange={(event) => patch({ name: event.target.value })}
              />
            </Field>
            <div className="mt-4 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label="Slug">
                  <Input
                    value={product.slug}
                    maxLength={160}
                    placeholder="alder-dining-chair"
                    onChange={(event) => patch({ slug: event.target.value })}
                  />
                </Field>
              </div>
              <Button
                aria-label="Generate product slug"
                type="button"
                variant="outline"
                onClick={() => patch({ slug: productSlug(product.name) })}
              >
                <Sparkles className="size-4" /> Generate
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border bg-white">
            <div
              role="tablist"
              aria-label="Product details"
              className="flex overflow-x-auto border-b bg-neutral-50 p-1"
            >
              {tabs.map((name) => (
                <button
                  type="button"
                  key={name}
                  role="tab"
                  id={`tab-${name}`}
                  aria-controls={`panel-${name}`}
                  aria-selected={tab === name}
                  tabIndex={tab === name ? 0 : -1}
                  onClick={() => setTab(name)}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const index = tabs.indexOf(name);
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : (index +
                              (event.key === "ArrowRight" ? 1 : -1) +
                              tabs.length) %
                            tabs.length;
                    setTab(tabs[next]);
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                      [next]?.focus();
                  }}
                  className={`shrink-0 rounded-lg px-4 py-3 text-sm transition ${tab === name ? "bg-white font-medium shadow-sm" : "text-neutral-500 hover:text-black"}`}
                >
                  {name}
                </button>
              ))}
            </div>
            {tabs.map((name) => (
              <div
                key={name}
                id={`panel-${name}`}
                role="tabpanel"
                tabIndex={0}
                aria-labelledby={`tab-${name}`}
                hidden={tab !== name}
                className="space-y-5 p-5"
              >
                {name === "General" && (
                  <>
                    <Field label="Short description">
                      <Textarea
                        value={product.summary}
                        maxLength={2000}
                        rows={3}
                        placeholder="A short introduction shown beside the product gallery."
                        onChange={(event) =>
                          patch({ summary: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Description">
                      <Textarea
                        className="min-h-64"
                        value={product.description}
                        maxLength={50000}
                        rows={12}
                        placeholder="Materials, features, care instructions and product details."
                        onChange={(event) =>
                          patch({ description: event.target.value })
                        }
                      />
                    </Field>
                  </>
                )}
                {name === "Images" && (
                  <>
                    <p className="text-sm text-neutral-500">
                      The first image is the product cover. Add up to 20 images.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {product.images.map((url, index) => (
                        <div
                          key={`${url}-${index}`}
                          className="overflow-hidden rounded-lg border"
                        >
                          <img
                            src={safeUrl(url, true)}
                            alt={`Product image ${index + 1}`}
                            className="aspect-square w-full bg-neutral-50 object-contain"
                          />
                          <div className="flex items-center justify-between border-t p-2">
                            <span className="text-xs text-neutral-500">
                              {index === 0 ? "Cover" : `Image ${index + 1}`}
                            </span>
                            <div className="flex gap-1">
                              {[-1, 1].map((direction) => (
                                <Button
                                  key={direction}
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Move image ${index + 1} ${direction < 0 ? "up" : "down"}`}
                                  disabled={
                                    index + direction < 0 ||
                                    index + direction >= product.images.length
                                  }
                                  onClick={() => {
                                    const images = [...product.images];
                                    [images[index], images[index + direction]] =
                                      [
                                        images[index + direction],
                                        images[index],
                                      ];
                                    patch({ images });
                                  }}
                                >
                                  {direction < 0 ? <ArrowUp /> : <ArrowDown />}
                                </Button>
                              ))}
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Remove product image ${index + 1}`}
                                onClick={() =>
                                  patch({
                                    images: product.images.filter(
                                      (_, position) => position !== index,
                                    ),
                                  })
                                }
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {product.images.length < 20 && (
                      <MediaPicker
                        value=""
                        label="Add product image"
                        onChange={(url) => {
                          if (url && !product.images.includes(url))
                            patch({ images: [...product.images, url] });
                        }}
                      />
                    )}
                  </>
                )}
                {name === "Inventory" && (
                  <>
                    <Field label="SKU">
                      <Input
                        value={product.sku}
                        maxLength={100}
                        placeholder="ALD-CHAIR-001"
                        onChange={(event) => patch({ sku: event.target.value })}
                      />
                    </Field>
                    <label className="flex items-center justify-between gap-4 text-sm">
                      <span>Track stock quantity</span>
                      <Switch
                        checked={product.manageStock}
                        onCheckedChange={(manageStock) =>
                          patch({ manageStock })
                        }
                      />
                    </label>
                    {product.manageStock ? (
                      <Field label="Quantity in stock">
                        <Input
                          type="number"
                          min={0}
                          max={10000000}
                          step={1}
                          value={product.stock}
                          onChange={(event) =>
                            patch({ stock: Number(event.target.value) })
                          }
                        />
                      </Field>
                    ) : (
                      <Field label="Availability">
                        <Select
                          value={product.availability}
                          onValueChange={(availability) =>
                            patch({
                              availability:
                                availability as Product["availability"],
                            })
                          }
                        >
                          <SelectOption value="In stock">In stock</SelectOption>
                          <SelectOption value="Out of stock">
                            Out of stock
                          </SelectOption>
                        </Select>
                      </Field>
                    )}
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Weight">
                        <Input
                          value={product.weight}
                          maxLength={100}
                          placeholder="e.g. 4.5 kg"
                          onChange={(event) =>
                            patch({ weight: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Dimensions">
                        <Input
                          value={product.dimensions}
                          maxLength={100}
                          placeholder="e.g. 80 × 45 × 50 cm"
                          onChange={(event) =>
                            patch({ dimensions: event.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </>
                )}
                {name === "Attributes" && (
                  <>
                    <p className="text-sm text-neutral-500">
                      Add product characteristics, such as material, size or
                      brand. Separate multiple values with commas.
                    </p>
                    {attributes.map((attribute, index) => (
                      <div
                        key={index}
                        className="grid gap-3 rounded-lg border bg-neutral-50 p-4 sm:grid-cols-[1fr_1.4fr_auto]"
                      >
                        <Field label="Attribute name">
                          <Input
                            maxLength={100}
                            value={attribute.name}
                            placeholder="Material"
                            onChange={(event) =>
                              setAttributes(
                                attributes.map((item, position) =>
                                  position === index
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Values">
                          <Input
                            value={attribute.values}
                            placeholder="Oak, Walnut"
                            onChange={(event) =>
                              setAttributes(
                                attributes.map((item, position) =>
                                  position === index
                                    ? { ...item, values: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Button
                          type="button"
                          className="self-end"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove attribute ${index + 1}`}
                          onClick={() =>
                            setAttributes(
                              attributes.filter(
                                (_, position) => position !== index,
                              ),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={attributes.length >= 30}
                      onClick={() =>
                        setAttributes([...attributes, { name: "", values: "" }])
                      }
                    >
                      <Plus /> Add attribute
                    </Button>
                  </>
                )}
                {name === "SEO" && (
                  <>
                    <Field label="SEO title">
                      <Input
                        value={product.seo.title}
                        maxLength={300}
                        placeholder={product.name}
                        onChange={(event) =>
                          patch({
                            seo: { ...product.seo, title: event.target.value },
                          })
                        }
                      />
                    </Field>
                    <Field label="Meta description">
                      <Textarea
                        rows={3}
                        value={product.seo.description}
                        maxLength={1000}
                        onChange={(event) =>
                          patch({
                            seo: {
                              ...product.seo,
                              description: event.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Social sharing image
                      </p>
                      <MediaPicker
                        value={product.seo.image}
                        onChange={(image) =>
                          patch({ seo: { ...product.seo, image } })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <aside className="space-y-5 xl:sticky xl:top-24">
          <Panel title="Publishing">
            <Field label="Status">
              <Select
                value={product.status}
                onValueChange={(status) =>
                  patch({ status: status as Product["status"] })
                }
              >
                {["Draft", "Published", "Archived"].map((status) => (
                  <SelectOption key={status} value={status}>
                    {status}
                  </SelectOption>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-neutral-500">
              {dirty
                ? "Unsaved changes"
                : initial.revision
                  ? "All changes saved"
                  : "New product"}
            </p>
            {product.updatedAt && (
              <p className="text-xs text-neutral-400">
                Updated {new Date(product.updatedAt).toLocaleString()}
              </p>
            )}
          </Panel>
          <Panel title="Pricing">
            <Field label="Currency">
              <Select
                value={product.currency}
                onValueChange={(currency) =>
                  patch({ currency: currency as Product["currency"] })
                }
              >
                {["GBP", "EUR", "USD", "RUB"].map((currency) => (
                  <SelectOption key={currency} value={currency}>
                    {currency}
                  </SelectOption>
                ))}
              </Select>
            </Field>
            <Field label="Regular price">
              <Input
                inputMode="decimal"
                required
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
            <Field label="Sale price">
              <Input
                inputMode="decimal"
                value={sale}
                placeholder="Optional"
                onChange={(event) => setSale(event.target.value)}
              />
            </Field>
          </Panel>
          <Panel title="Categories">
            <Field label="Categories">
              <Input
                value={categories}
                placeholder="Furniture, Chairs"
                onChange={(event) => setCategories(event.target.value)}
              />
            </Field>
            <p className="text-xs text-neutral-500">
              Separate categories with commas.
            </p>
            {split(categories).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {split(categories).map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-neutral-100 px-3 py-1 text-xs"
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </fieldset>
    </form>
  );
}
