import { AdminPanel } from "@/components/admin/admin-panel";
import { BrandEditor } from "@/components/builder/brand-editor";

export default function Page() {
  return (
    <AdminPanel
      title="Brand setup"
      className="w-full"
    >
      <BrandEditor />
    </AdminPanel>
  );
}
