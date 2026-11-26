import { ShopShell } from "@/components/admin/shop/shop-shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ShopShell>{children}</ShopShell>;
}
