import Link from "next/link";
import { requireSuperAdmin } from "@/lib/builder/current-user";
import { readProject } from "@/lib/builder/server";
import { publicProject } from "@/lib/builder/workflows";
import { listProducts } from "@/lib/shop/products";
import { available } from "@/lib/shop/catalog";
import { productPageVariants } from "@/lib/builder/types";
import { SiteCanvas } from "@/components/builder/site-canvas";
import { ProductDetail } from "@/components/shop/product-detail";
import "@/components/builder/site.scss";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Product page preview",
  robots: { index: false, follow: false },
};
export default async function ProductPreview({
  searchParams,
}: {
  searchParams: Promise<{ layout?: string; product?: string }>;
}) {
  await requireSuperAdmin();
  const project = publicProject(await readProject());
  const query = await searchParams;
  const products = (await listProducts()).filter(
    (p) => p.status === "Published",
  );
  const product =
    products.find((p) => p.slug === query.product) ||
    products.find((p) => available(p)) ||
    products[0];
  const variant =
    productPageVariants.find((v) => v === query.layout) ||
    project.store?.catalog?.productPage ||
    "split";
  return (
    <SiteCanvas project={project} sections={[]}>
      {product ? (
        <ProductDetail product={product} variant={variant} />
      ) : (
        <section className="container">
          <h1 className="heading heading--lg">No published products</h1>
          <Link href="/dashboard/shop">Add a product to preview its page</Link>
        </section>
      )}
    </SiteCanvas>
  );
}
