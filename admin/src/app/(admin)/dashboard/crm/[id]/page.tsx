import { ContactCard } from "@/components/admin/crm/contact-card";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContactCard id={id} />;
}
