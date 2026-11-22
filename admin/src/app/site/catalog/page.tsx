import { publicMetadata } from "@/lib/builder/seo";
import { notFound } from "next/navigation";
import { readProject } from "@/lib/builder/server";
import { publicProject } from "@/lib/builder/workflows";
import { listProducts } from "@/lib/shop/products";
import { defaultCatalog } from "@/lib/shop/catalog";
import { SiteCanvas } from "@/components/builder/site-canvas";
import { ProductCatalog } from "@/components/shop/catalog";
import "@/components/builder/site.scss";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const project = await readProject();
  return publicMetadata(
    project,
    project.store?.catalog?.title || "Collection",
    project.store?.catalog?.description || "",
    "/site/catalog",
  );
}
export default async function CatalogPage() {
  const project = publicProject(await readProject());
  const settings = project.store?.catalog ?? defaultCatalog;
  if (!project.store?.enabled || !settings.enabled) notFound();
  const products = (await listProducts()).filter(
    (p) => p.status === "Published",
  );
  return (
    <SiteCanvas project={project} sections={[]}>
      <ProductCatalog products={products} settings={settings} />
    </SiteCanvas>
  );
}
