"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Package } from "lucide-react";
import type { ProductCardVariant } from "@/lib/builder/types";
import type { Product } from "@/lib/shop/types";
import { available, formatPrice } from "@/lib/shop/catalog";
import { AddToCart } from "./add-to-cart";
import "./product-card.scss";
export function ProductCard({
  product: p,
  variant = "minimal",
}: {
  product: Product;
  variant?: ProductCardVariant;
}) {
  return (
    <article className={`store-product store-product--${variant}`}>
      <Link href={`/site/catalog/${p.slug}`} className="store-product__image">
        {p.images[0] ? (
          <img src={p.images[0]} alt={p.name} loading="lazy" />
        ) : (
          <Package size={48} aria-hidden="true" />
        )}
        <span className="store-product__badges">
          {!available(p)
            ? "Out of stock"
            : p.salePrice !== null
              ? "Sale"
              : null}
        </span>
      </Link>
      <div className="store-product__content">
        <div className="store-product__info">
          <h2 className="heading heading--sm">
            <Link href={`/site/catalog/${p.slug}`}>{p.name}</Link>
          </h2>
          <p className="text text--md">
            {formatPrice(p)}{" "}
            {p.salePrice !== null && <del>{formatPrice(p, p.price)}</del>}
          </p>
        </div>
        <p className="store-product__summary text text--sm text--muted">
          {p.summary}
        </p>
        <AddToCart
          id={p.id}
          name={p.name}
          limit={
            available(p) ? (p.manageStock ? Math.min(99, p.stock) : 99) : 0
          }
        />
      </div>
    </article>
  );
}
