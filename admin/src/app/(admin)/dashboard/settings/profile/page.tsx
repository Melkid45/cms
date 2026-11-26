import { AdminPanel } from "@/components/admin/admin-panel";
import { ProfileForm } from "@/components/admin/profile-form";

export default function ProfilePage() {
  return (
    <AdminPanel
      title="Profile"
      className="mx-auto"
    >
      <ProfileForm />
    </AdminPanel>
  );
}
