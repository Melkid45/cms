"use client";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useAccess } from "@/components/admin/access-context";
import { useWorkspace } from "@/components/admin/site-context";
import { Segmented } from "@/components/admin/admin-panel";

export function ShopShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { role } = useAccess();
  const workspace = useWorkspace();
  const tabs = [
    ["products", "Products", "/dashboard/shop/products"],
    ...(role !== "designer"
      ? [["orders", "Orders", "/dashboard/shop/orders"]]
      : []),
    ["settings", "Settings", "/dashboard/shop/settings"],
  ] as [string, string, string][];
  const active = path.startsWith("/dashboard/shop/orders")
    ? "orders"
    : path.startsWith("/dashboard/shop/settings")
      ? "settings"
      : "products";
  return (
    <div key={workspace?.site?.id || "default"} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white">
            <ShoppingBag className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Shop</h2>
            <p className="text-xs text-neutral-500">
              {workspace?.site?.name || "Your website"}
            </p>
          </div>
        </div>
        <Segmented items={tabs} active={active} className="w-full sm:w-auto" />
      </div>
      {children}
    </div>
  );
}
