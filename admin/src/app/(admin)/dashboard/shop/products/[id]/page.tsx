import { ProductForm } from "@/components/admin/catalog/product-form";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductForm id={id} />;
}
