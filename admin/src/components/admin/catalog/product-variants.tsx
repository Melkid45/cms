"use client";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MediaPicker } from "@/components/builder/media-picker";
import {
  availableQty,
  STOCK,
  STOCK_LABELS,
  type ProductVariant,
  type Stock,
} from "@/lib/builder/products/shared";
export function ProductVariantsEditor({
  variants,
  onChange,
  basePrice,
  currency="EUR",
}: {
  variants: ProductVariant[];
  onChange: (variants: ProductVariant[]) => void;
  basePrice: number;
  currency?:string;
}) {
  const patch = (id: string, value: Partial<ProductVariant>) =>
    onChange(variants.map((v) => (v.id === id ? { ...v, ...value } : v)));
  return (
    <section className="space-y-5 rounded-xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Variations</h2>
          <p className="mt-1 max-w-xl text-sm text-neutral-500">
            Size, colour or configuration. Each variation has its own price,
            SKU, photo and stock.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={variants.length >= 100}
          onClick={() =>
            onChange([
              ...variants,
              {
                id: crypto.randomUUID(),
                name: "",
                attributes: [],
                sku: "",
                price: Number.isFinite(basePrice) ? basePrice : 0,
                oldPrice: null,
                images: [],
                qty: null,
                stock: "in_stock",
                hidden: false,
              },
            ])
          }
        >
          <Plus />
          Add variation
        </Button>
      </div>
      {!variants.length && (
        <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">
          This is a simple product. Add variations only when the buyer needs to
          choose an option.
        </p>
      )}
      {variants.map((v, index) => (
        <details
          key={v.id}
          open
          className="group rounded-xl border border-neutral-200"
        >
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
            {v.name || `Variation ${index + 1}`}
            <span className="ml-3 font-normal text-neutral-500">
              {v.sku ? `${v.sku} · ` : ""}{currency} {v.price} ·{" "}
              {v.stock === "to_order"
                ? "Made to order"
                : availableQty(v) === null
                  ? "Unlimited"
                  : `${availableQty(v)} available`}
              {(v.reserved || 0) > 0 ? ` · ${v.reserved} reserved` : ""}
            </span>
          </summary>
          <div className="space-y-5 border-t p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`variant-name-${v.id}`}>Variation name</Label>
                <Input
                  id={`variant-name-${v.id}`}
                  value={v.name}
                  maxLength={120}
                  placeholder="Black / Medium"
                  onChange={(e) => patch(v.id, { name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`variant-sku-${v.id}`}>SKU</Label>
                <Input
                  id={`variant-sku-${v.id}`}
                  value={v.sku}
                  maxLength={60}
                  onChange={(e) => patch(v.id, { sku: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`variant-price-${v.id}`}>Price, {currency}</Label>
                <Input
                  id={`variant-price-${v.id}`}
                  type="number"
                  min={0}
                  max={10000000}
                  step="0.01"
                  value={v.price}
                  onChange={(e) =>
                    patch(v.id, { price: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`variant-old-${v.id}`}>Old price</Label>
                <Input
                  id={`variant-old-${v.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={v.oldPrice ?? ""}
                  onChange={(e) =>
                    patch(v.id, {
                      oldPrice:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`variant-stock-${v.id}`}>Availability</Label>
                <Select
                  id={`variant-stock-${v.id}`}
                  value={v.stock}
                  onValueChange={(stock) =>
                    patch(v.id, { stock: stock as Stock })
                  }
                >
                  {STOCK.map((s) => (
                    <SelectOption key={s} value={s}>
                      {STOCK_LABELS[s]}
                    </SelectOption>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`variant-qty-${v.id}`}>On-hand quantity</Label>
                <Input
                  id={`variant-qty-${v.id}`}
                  type="number"
                  min={v.reserved || 0}
                  step={1}
                  value={v.qty ?? ""}
                  placeholder="Unlimited"
                  onChange={(e) =>
                    patch(v.id, {
                      qty:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-neutral-500">
                  {v.reserved || 0} reserved · {availableQty(v) ?? "Unlimited"}{" "}
                  available
                </p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <Label>Photo</Label>
                <MediaPicker
                  value={v.images[0] || ""}
                  onChange={(image) =>
                    patch(v.id, { images: image ? [image] : [] })
                  }
                />
              </div>
              <div className="space-y-3">
                <Label>Attributes</Label>
                {v.attributes.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      aria-label={`Attribute ${i + 1} name`}
                      value={a.key}
                      placeholder="Colour"
                      maxLength={40}
                      onChange={(e) =>
                        patch(v.id, {
                          attributes: v.attributes.map((x, j) =>
                            j === i ? { ...x, key: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Input
                      aria-label={`Attribute ${i + 1} value`}
                      value={a.value}
                      placeholder="Black"
                      maxLength={80}
                      onChange={(e) =>
                        patch(v.id, {
                          attributes: v.attributes.map((x, j) =>
                            j === i ? { ...x, value: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove attribute ${i + 1}`}
                      onClick={() =>
                        patch(v.id, {
                          attributes: v.attributes.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {v.attributes.length < 5 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      patch(v.id, {
                        attributes: [...v.attributes, { key: "", value: "" }],
                      })
                    }
                  >
                    <Plus />
                    Attribute
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={!v.hidden}
                  onCheckedChange={(shown) => patch(v.id, { hidden: !shown })}
                />
                Shown on website
              </label>
              <Button
                type="button"
                variant="ghost"
                disabled={(v.reserved || 0) > 0}
                onClick={() => onChange(variants.filter((x) => x.id !== v.id))}
              >
                <Trash2 />
                Remove variation
              </Button>
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}
