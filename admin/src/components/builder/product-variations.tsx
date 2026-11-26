"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  availableQty,
  variantLabel,
  formatPrice,
  type ProductVariant,
  type Stock,
} from "@/lib/builder/products/shared";
export function ProductVariations({
  productId,
  variants,
  price,
  images,
  qty,
  stock,
  sku,
  format,
  hasVariants = variants.length > 0,
  locale = "en",
}: {
  productId: string;
  variants: ProductVariant[];
  price: number;
  images: string[];
  qty: number | null;
  stock: Stock;
  sku: string;
  format: string;
  locale?: string;
  hasVariants?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const choices = variants.filter((v) => !v.hidden);
  const available = (v: {
    stock: Stock;
    qty: number | null;
    reserved?: number;
  }) =>
    v.stock !== "out_of_stock" &&
    (v.stock === "to_order" ||
      availableQty(v) === null ||
      (availableQty(v) || 0) > 0);
  const [id, setId] = useState(
    () => choices.find(available)?.id || choices[0]?.id || "",
  );
  const variant = choices.find((v) => v.id === id);
  const item = useMemo(
    () => variant || { price, images, qty, stock, sku },
    [variant, price, images, qty, stock, sku],
  );
  const blocked = (hasVariants && !variant) || !available(item);
  const words =
    locale === "ru"
      ? {
          variation: "Вариант",
          available: "Доступно",
          out: "Нет в наличии",
          order: "Под заказ",
          stock: "В наличии",
        }
      : locale === "lv"
        ? {
            variation: "Variants",
            available: "Pieejams",
            out: "Nav noliktavā",
            order: "Pēc pasūtījuma",
            stock: "Ir noliktavā",
          }
        : {
            variation: "Variation",
            available: "Available",
            out: "Out of stock",
            order: "Made to order",
            stock: "In stock",
          };
  useEffect(() => {
    const section = root.current?.closest<HTMLElement>("[data-product]");
    if (!section) return;
    section.dataset.productId = productId;
    section.dataset.variantId = variant?.id || "";
    section.dataset.variantLabel = variant ? variantLabel(variant) : "";
    section.dataset.unavailable = blocked ? "true" : "false";
    if (hasVariants) {
      const priceNode = section.querySelector<HTMLElement>(
        "[data-product-price]",
      );
      if (priceNode) priceNode.textContent = formatPrice(item.price, format);
      const image =
        section.querySelector<HTMLImageElement>(".pricing__pd-image");
      const source = item.images[0] || images[0];
      if (image && source) {
        image.src = source;
        image.removeAttribute("srcset");
      }
    }
    section
      .querySelectorAll<HTMLElement>(".pricing__pd-buy .button")
      .forEach((button) =>
        button.setAttribute("aria-disabled", String(blocked)),
      );
  }, [productId, variant, item, blocked, format, images, hasVariants]);
  return (
    <div
      ref={root}
      className="pricing__pd-variations"
      data-product-variation-picker
      data-has-variants={hasVariants ? "" : undefined}
    >
      {choices.length > 0 && (
        <fieldset className="pricing__pd-variant-group">
          <legend className="text text--sm">{words.variation}</legend>
          <div className="pricing__pd-variant-options">
            {choices.map((v) => (
              <label
                key={v.id}
                className={`pricing__pd-variant-option text text--sm${v.id === id ? " is-active" : ""}`}
              >
                <input
                  type="radio"
                  name={`variant-${productId}`}
                  value={v.id}
                  checked={v.id === id}
                  disabled={!available(v)}
                  onChange={() => setId(v.id)}
                />
                <span>
                  {variantLabel(v)}
                  {!available(v) ? ` · ${words.out}` : ""}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {variant?.oldPrice != null && variant.oldPrice > variant.price && (
        <del className="text text--sm">
          {formatPrice(variant.oldPrice, format)}
        </del>
      )}
      <p className="text text--sm" role="status" aria-live="polite">
        {blocked
          ? words.out
          : item.stock === "to_order"
            ? words.order
            : item.qty === null
              ? words.stock
              : `${words.available}: ${availableQty(item)}`}
        {item.sku ? ` · SKU: ${item.sku}` : ""}
      </p>
    </div>
  );
}
