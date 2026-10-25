import { PageHeader } from "@/components/admin/page-header";
import { SetupForm } from "@/components/admin/setup-form";

export default function Page() {
  return (
    <div className="rise-in w-full">
      <PageHeader title="Brand setup" description="Upload your logo and define the colors used across the website." />
      <SetupForm />
    </div>
  );
}
