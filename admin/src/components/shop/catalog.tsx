"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Select, SelectOption } from "@/components/ui/select";
import type { CatalogSettings } from "@/lib/builder/types";
import type { Product } from "@/lib/shop/types";
import { filterProducts } from "@/lib/shop/catalog";
import "./catalog.scss";
import { ProductCard } from "./product-card";
export function ProductCatalog({
  products,
  settings,
}: {
  products: Product[];
  settings: CatalogSettings;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState(false);
  const [sort, setSort] = useState("newest");
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(12);
  const filtered = filterProducts(products, {
    query,
    category,
    stock,
    sort,
    attributes,
  });
  const categories = [...new Set(products.flatMap((p) => p.categories))].sort();
  function reset() {
    setQuery("");
    setCategory("");
    setStock(false);
    setAttributes({});
    setLimit(12);
  }
  return (
    <section
      className={`store-catalog store-catalog--${settings.variant || "grid"} container`}
    >
      <header className="store-catalog__heading">
        <h1 className="heading heading--lg">{settings.title}</h1>
        <p className="text text--lg text--muted">{settings.description}</p>
      </header>
      <div className="store-catalog__body">
        <aside className="store-catalog__filters" aria-label="Catalog filters">
          <h2 className="store-catalog__filter-title heading heading--sm">
            Filters
          </h2>
          <div className="store-catalog__toolbar">
            {settings.search && (
              <label className="store-catalog__search">
                <Search size={20} />
                <input
                  aria-label="Search collection"
                  placeholder="Search collection"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(12);
                  }}
                />
              </label>
            )}
            {settings.categories && (
              <Select
                aria-label="Filter by category"
                value={category || "__all__"}
                onValueChange={(v) => {
                  setCategory(v === "__all__" ? "" : v);
                  setLimit(12);
                }}
              >
                <SelectOption value="__all__">All categories</SelectOption>
                {categories.map((c) => (
                  <SelectOption key={c} value={c}>
                    {c}
                  </SelectOption>
                ))}
              </Select>
            )}
            {settings.attributes.map((name) => {
              const values = [
                ...new Set(
                  products.flatMap((p) =>
                    p.attributes
                      .filter((a) => a.name === name)
                      .flatMap((a) => a.values),
                  ),
                ),
              ].sort();
              return (
                values.length > 0 && (
                  <Select
                    key={name}
                    aria-label={`Filter by ${name}`}
                    value={attributes[name] || "__all__"}
                    onValueChange={(v) => {
                      setAttributes((a) => ({
                        ...a,
                        [name]: v === "__all__" ? "" : v,
                      }));
                      setLimit(12);
                    }}
                  >
                    <SelectOption value="__all__">
                      All {name.toLowerCase()}
                    </SelectOption>
                    {values.map((v) => (
                      <SelectOption key={v} value={v}>
                        {v}
                      </SelectOption>
                    ))}
                  </Select>
                )
              );
            })}
            <Select
              aria-label="Sort collection"
              value={sort}
              onValueChange={setSort}
            >
              <SelectOption value="newest">Newest first</SelectOption>
              <SelectOption value="name">Name A–Z</SelectOption>
              <SelectOption value="price-up">Price: low to high</SelectOption>
              <SelectOption value="price-down">Price: high to low</SelectOption>
            </Select>
          </div>
        </aside>
        <div className="store-catalog__results">
          <div className="store-catalog__meta">
            <p className="text text--sm" role="status">
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
            </p>
            {settings.availability && (
              <label>
                <input
                  type="checkbox"
                  checked={stock}
                  onChange={(e) => {
                    setStock(e.target.checked);
                    setLimit(12);
                  }}
                />{" "}
                In stock only
              </label>
            )}
            <button type="button" onClick={reset}>
              Reset filters
            </button>
          </div>
          <div className="store-catalog__grid">
            {filtered.slice(0, limit).map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                variant={settings.productCard || "minimal"}
              />
            ))}
          </div>
          {!filtered.length && (
            <div className="store-catalog__empty">
              <h2 className="heading heading--md">No matching products</h2>
              <p className="text text--md">
                Try another search or reset the filters.
              </p>
              <button className="button button--outline" onClick={reset}>
                Reset filters
              </button>
            </div>
          )}
          {filtered.length > limit && (
            <button
              className="button button--outline"
              onClick={() => setLimit((l) => l + 12)}
            >
              Show more products
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
