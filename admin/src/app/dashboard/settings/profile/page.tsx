import { PageHeader } from "@/components/admin/page-header";
import { ProfileForm } from "@/components/admin/profile-form";

export default function ProfilePage() {
  return (
    <div className="rise-in mx-auto max-w-4xl">
      <PageHeader title="Profile" description="Personal details, security, and notification preferences." />
      <ProfileForm />
    </div>
  );
}
