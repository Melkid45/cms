import { PageBuilder } from "@/components/admin/page-builder";
import { getBlockCatalog } from "@/lib/block-catalog";

export default async function NewPage() {
  return <PageBuilder catalog={await getBlockCatalog()} />;
}
