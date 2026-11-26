"use client";
import { useCallback, useEffect, useState } from "react";
import { withSite } from "@/lib/builder/site-client";
import type { Catalog, Product } from "@/lib/builder/products/shared";
import type { Languages } from "@/lib/builder/types";

export interface ProductPage {
  id: string;
  title: string;
  slug: string;
  locale: string;
  published: boolean;
}
export interface CatalogData {
  currency?:string;
  catalog: Catalog;
  siteKey: string;
  languages: Languages | null;
  locales: string[];
  productPages: ProductPage[];
}
export async function catalogFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(withSite(path), {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || "Something went wrong.");
  return data as T;
}
export function useCatalog() {
  const [data, setData] = useState<CatalogData | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await catalogFetch<CatalogData>("/api/builder/catalog"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the catalogue.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);
  return { data, setData, error, setError, reload: load };
}
// Public address of a product in a language (the website's own address prefix rules).
export function productHref(data: CatalogData, product: Product, locale: string) {
  const slug = product.text[locale as keyof Product["text"]]?.slug;
  if (!slug) return "";
  const l = data.languages;
  const prefix = l && l.enabled.length > 1 && locale !== l.default ? `${locale}/` : "";
  return `/site/${data.siteKey}/${prefix}${slug}`;
}
