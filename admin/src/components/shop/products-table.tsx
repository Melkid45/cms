"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Package, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { safeUrl } from "@/lib/builder/catalog";
import type { Product } from "@/lib/shop/types";

export function ProductsTable({ initial }: { initial: Product[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(0);
  const categories = [
    ...new Set(initial.flatMap((item) => item.categories)),
  ].sort();
  const filtered = initial.filter(
    (item) =>
      (status === "All" || item.status === status) &&
      (category === "All" || item.categories.includes(category.slice(9))) &&
      [item.name, item.sku, item.slug, ...item.categories]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const sorted = [...filtered].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "price"
        ? a.price - b.price
        : b.updatedAt.localeCompare(a.updatedAt),
  );
  const pages = Math.max(1, Math.ceil(sorted.length / 20));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * 20, current * 20 + 20);
  return (
    <div>
      <PageHeader
        title="Products"
        description="Your inventory, pricing and product content."
        action={
          <Button
            nativeButton={false}
            render={<Link href="/dashboard/shop/products/new" />}
          >
            <Plus /> Add product
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {["All", "Published", "Draft", "Archived"].map((value) => (
          <Button
            key={value}
            variant={status === value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              setStatus(value);
              setPage(0);
            }}
          >
            {value}{" "}
            <span className="text-neutral-400">
              {
                initial.filter(
                  (item) => value === "All" || item.status === value,
                ).length
              }
            </span>
          </Button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-neutral-400" />
            <Input
              aria-label="Search products"
              placeholder="Search by name or SKU"
              className="pl-9"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="w-48">
            <Select
              aria-label="Category filter"
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setPage(0);
              }}
            >
              <SelectOption value="All">All categories</SelectOption>
              {categories.map((name) => (
                <SelectOption key={name} value={`category:${name}`}>
                  {name}
                </SelectOption>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select
              aria-label="Sort products"
              value={sort}
              onValueChange={setSort}
            >
              <SelectOption value="updated">Recently updated</SelectOption>
              <SelectOption value="name">Name A–Z</SelectOption>
              <SelectOption value="price">Price low to high</SelectOption>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                {[
                  "Product",
                  "SKU",
                  "Stock",
                  "Price",
                  "Categories",
                  "Status",
                ].map((label) => (
                  <th key={label} scope="col" className="px-5 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr
                  key={item.id}
                  className="border-t transition hover:bg-neutral-50"
                >
                  <td className="px-5 py-4">
                    <Link
                      className="flex items-center gap-3 font-medium"
                      href={`/dashboard/shop/products/${item.id}`}
                    >
                      {item.images[0] ? (
                        <img
                          className="size-12 rounded-lg border object-cover"
                          src={safeUrl(item.images[0], true)}
                          alt=""
                        />
                      ) : (
                        <span className="grid size-12 place-items-center rounded-lg bg-neutral-100">
                          <Package className="size-5 text-neutral-400" />
                        </span>
                      )}
                      <span>
                        {item.name}
                        <span className="mt-1 block text-xs font-normal text-neutral-400">
                          Edit product
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-neutral-500">
                    {item.sku || "—"}
                  </td>
                  <td className="px-5 py-4">
                    {item.manageStock
                      ? `${item.stock} available`
                      : item.availability}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {new Intl.NumberFormat("en-GB", {
                      style: "currency",
                      currency: item.currency,
                    }).format((item.salePrice ?? item.price) / 100)}
                    {item.salePrice !== null && (
                      <span className="ml-2 text-xs text-neutral-400 line-through">
                        {(item.price / 100).toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="max-w-52 px-5 py-4 text-neutral-500">
                    {item.categories.join(", ") || "—"}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full border px-2.5 py-1 text-xs">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <div className="grid justify-items-center gap-3 p-14 text-center">
            <Package className="size-8 text-neutral-300" />
            <p className="font-medium">
              {initial.length
                ? "No matching products"
                : "Your first product starts here"}
            </p>
            <p className="text-sm text-neutral-500">
              {initial.length
                ? "Try another search or filter."
                : "Add photos, pricing and details to start your inventory."}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-neutral-500">
          <span>
            {filtered.length} products · Page {current + 1} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft className="size-3" /> Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={current + 1 >= pages}
              onClick={() => setPage(current + 1)}
            >
              Next <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
