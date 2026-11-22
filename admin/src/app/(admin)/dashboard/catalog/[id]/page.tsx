import { ProductForm } from "@/components/admin/catalog/product-form";

// /dashboard/catalog/new or /dashboard/catalog/{product id}
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductForm id={id} />;
}
