import { PageHeader } from "@/components/admin/page-header";
import { ProjectSettingsForm } from "@/components/admin/project-settings-form";

export default function ProjectSettingsPage() {
  return (
    <div className="rise-in w-full">
      <PageHeader
        title="Project settings"
        description="Website identity, store preferences, regional settings, and outgoing email."
      />
      <ProjectSettingsForm />
    </div>
  );
}
