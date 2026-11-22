import { PageHeader } from "@/components/admin/page-header";
import { ContentManager } from "@/components/builder/content-manager";
export default function Page() {
  return (
    <>
      <PageHeader
        title="Forms"
        description="Build fields once. Use your form in contact blocks and button actions."
      />
      <ContentManager kind="forms" />
    </>
  );
}
