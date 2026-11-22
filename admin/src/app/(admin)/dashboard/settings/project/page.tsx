import { AdminPanel } from "@/components/admin/admin-panel";
import { ProjectSettingsForm } from "@/components/admin/project-settings-form";

export default function ProjectSettingsPage() {
  return (
    <AdminPanel
      title="Project settings"
      className="w-full"
    >
      <ProjectSettingsForm />
    </AdminPanel>
  );
}
