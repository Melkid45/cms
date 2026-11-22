import { requireSuperAdmin } from "@/lib/builder/current-user";
import { readProject } from "@/lib/builder/server";
import { publicProject } from "@/lib/builder/workflows";
import { listProducts } from "@/lib/shop/products";
import { catalogVariants, productCardVariants } from "@/lib/builder/types";
import { defaultCatalog } from "@/lib/shop/catalog";
import { SiteCanvas } from "@/components/builder/site-canvas";
import { ProductCatalog } from "@/components/shop/catalog";
import "@/components/builder/site.scss";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Catalog preview",
  robots: { index: false, follow: false },
};
export default async function CatalogPreview({
  searchParams,
}: {
  searchParams: Promise<{ layout?: string; card?: string }>;
}) {
  await requireSuperAdmin();
  const project = publicProject(await readProject());
  const query = await searchParams;
  const variant =
    catalogVariants.find((value) => value === query.layout) || "grid";
  const productCard =
    productCardVariants.find((value) => value === query.card) ||
    project.store?.catalog?.productCard ||
    "minimal";
  const settings = {
    ...defaultCatalog,
    ...project.store?.catalog,
    variant,
    productCard,
  };
  const products = (await listProducts()).filter(
    (p) => p.status === "Published",
  );
  return (
    <SiteCanvas project={project} sections={[]}>
      <ProductCatalog products={products} settings={settings} />
    </SiteCanvas>
  );
}
