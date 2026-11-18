import { ProductEditor } from "@/components/shop/product-editor";
import { emptyProduct } from "@/lib/shop/types";
export default function NewProductPage() {
  return <ProductEditor initial={emptyProduct()} />;
}
