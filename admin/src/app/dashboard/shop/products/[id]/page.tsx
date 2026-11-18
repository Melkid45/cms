import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/shop/product-editor";
import { listProducts } from "@/lib/shop/products";
import { requireSuperAdmin } from "@/lib/builder/current-user";
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const product = (await listProducts()).find((item) => item.id === id);
  if (!product) notFound();
  return <ProductEditor key={product.id} initial={product} />;
}
