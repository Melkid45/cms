import { ProductsTable } from "@/components/shop/products-table";
import { listProducts } from "@/lib/shop/products";
import { requireSuperAdmin } from "@/lib/builder/current-user";
export default async function ShopPage() {
  await requireSuperAdmin();
  return <ProductsTable initial={await listProducts()} />;
}
