import { CatalogSettings } from "@/components/shop/catalog-settings";
import { listProducts } from "@/lib/shop/products";
export default async function CatalogSettingsPage() {
  const products = await listProducts();
  return (
    <CatalogSettings
      attributes={[
        ...new Set(
          products
            .filter((p) => p.status === "Published")
            .flatMap((p) => p.attributes.map((a) => a.name)),
        ),
      ].sort()}
    />
  );
}
