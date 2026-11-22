import { PageHeader } from "@/components/admin/page-header";
import { ContentManager } from "@/components/builder/content-manager";
export default function Page() {
  return (
    <>
      <PageHeader
        title="Services"
        description="Service content, detail pages and enquiry forms."
      />
      <ContentManager kind="services" />
    </>
  );
}
