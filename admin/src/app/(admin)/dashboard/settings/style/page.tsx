import { AdminPanel } from "@/components/admin/admin-panel";
import { WebsiteStyle } from "@/components/admin/website-style";

export default function StylePage() {
  return (
    <AdminPanel
      title="Website style"
      className="w-full"
    >
      <WebsiteStyle />
    </AdminPanel>
  );
}
