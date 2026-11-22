import Link from "next/link";
import type { Product } from "@/lib/shop/types";
import type { ProductPageVariant } from "@/lib/builder/types";
import { available, formatPrice } from "@/lib/shop/catalog";
import { AddToCart } from "./add-to-cart";
import { ProductGallery } from "./product-gallery";
import "./product-detail.scss";
export function ProductDetail({
  product: p,
  variant = "split",
}: {
  product: Product;
  variant?: ProductPageVariant;
}) {
  const specs = [
    ...(p.sku ? [["SKU", p.sku]] : []),
    ...p.attributes.map((a) => [a.name, a.values.join(", ")]),
    ...(p.dimensions ? [["Dimensions", p.dimensions]] : []),
    ...(p.weight ? [["Weight", p.weight]] : []),
  ];
  return (
    <section className={`product-page product-page--${variant} container`}>
      <Link href="/site/catalog" className="product-page__back text text--sm">
        Back to collection
      </Link>
      <div className="product-page__layout">
        <div className="product-page__gallery">
          <ProductGallery
            key={p.id}
            images={p.images}
            name={p.name}
            mode={
              variant === "gallery"
                ? "grid"
                : variant === "spotlight"
                  ? "wide"
                  : "single"
            }
          />
        </div>
        <div className="product-page__summary">
          <header className="product-page__heading">
            <h1 className="heading heading--lg">{p.name}</h1>
            {p.summary && (
              <p className="text text--lg text--muted">{p.summary}</p>
            )}
          </header>
          <div className="product-page__purchase">
            <p className="product-page__price text text--lg">
              {formatPrice(p)}{" "}
              {p.salePrice !== null && (
                <del className="text text--md text--muted">
                  {formatPrice(p, p.price)}
                </del>
              )}
            </p>
            <p className="text text--sm">
              {available(p) ? "In stock" : "Out of stock"}
            </p>
            <AddToCart
              id={p.id}
              name={p.name}
              limit={
                available(p) ? (p.manageStock ? Math.min(99, p.stock) : 99) : 0
              }
            />
          </div>
        </div>
        {p.description && (
          <div className="product-page__description">
            <h2 className="heading heading--sm">The details</h2>
            <p className="text text--md text--muted">{p.description}</p>
          </div>
        )}
        {specs.length > 0 && (
          <div className="product-page__specs">
            <h2 className="heading heading--sm">Specifications</h2>
            <dl className="text text--sm">
              {specs.map(([name, value], i) => (
                <div key={`${name}-${i}`}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
