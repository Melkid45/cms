import { Contacts } from "@/components/admin/crm/contacts";

// CRM contacts of the selected website (owner and the website's clients; designers are
// stopped by the shell route check and get 403 from the API).
export default function CrmPage() {
  return <Contacts />;
}
