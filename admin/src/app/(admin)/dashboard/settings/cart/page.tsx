import { AdminPanel } from "@/components/admin/admin-panel";
import { ShopSettings } from "@/components/admin/shop-settings";

export default function CartSettingsPage() {
  return (
    <AdminPanel title="Shop cart" className="w-full">
      <ShopSettings />
    </AdminPanel>
  );
}
