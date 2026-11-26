import { PageEditor } from "@/components/builder/page-editor";
export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <PageEditor slug={(await params).slug} />;
}
