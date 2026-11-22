import { publicMetadata } from "@/lib/builder/seo";
import { notFound } from "next/navigation";
import { readProject } from "@/lib/builder/server";
import { publicProject } from "@/lib/builder/workflows";
import { listProducts } from "@/lib/shop/products";
import { ProductDetail } from "@/components/shop/product-detail";
import { SiteCanvas } from "@/components/builder/site-canvas";
import "@/components/builder/site.scss";
import "@/components/shop/catalog.scss";
export const dynamic = "force-dynamic";
async function load(slug: string) {
  const project = publicProject(await readProject());
  if (!project.store?.enabled || !project.store.catalog?.enabled) notFound();
  const product = (await listProducts()).find(
    (p) => p.status === "Published" && p.slug === slug,
  );
  if (!product) notFound();
  return { project, product };
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { project, product } = await load((await params).slug);
  return publicMetadata(
    project,
    product.seo.title || product.name,
    product.seo.description || product.summary,
    `/site/catalog/${product.slug}`,
    product.seo.image || product.images[0],
  );
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { project, product: p } = await load((await params).slug);
  return (
    <SiteCanvas project={project} sections={[]}>
      <ProductDetail
        product={p}
        variant={project.store?.catalog?.productPage || "split"}
      />
    </SiteCanvas>
  );
}
