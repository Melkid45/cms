import { currentUser } from "@/lib/builder/current-user";
import { SeoAssistant } from "@/components/admin/seo-assistant";
// AI SEO assistant: approval queue (all roles; clients only for their websites with the SEO
// pack — checked by /api/builder/seo/assistant). BUILDER.md → AI SEO assistant.
export default async function SeoAssistantPage() {
  await currentUser();
  return <SeoAssistant />;
}
