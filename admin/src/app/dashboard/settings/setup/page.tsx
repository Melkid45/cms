import { PageHeader } from "@/components/admin/page-header";
import { BrandEditor } from "@/components/builder/brand-editor";

export default function Page() {
  return (
    <div className="rise-in w-full">
      <PageHeader
        title="Site design"
        description="One visual system for every page. Preview changes, then apply them across your website."
      />
      <BrandEditor />
    </div>
  );
}
