import { notFound } from "next/navigation";
import { PageBuilder } from "@/components/admin/page-builder";
import { getBlockCatalog } from "@/lib/block-catalog";
import { examplePages } from "@/lib/example-pages";

export default async function EditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = examplePages.find((item) => item.slug === slug);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();
  return <PageBuilder key={slug} pageSlug={slug} catalog={await getBlockCatalog()} initialPage={page} />;
}
