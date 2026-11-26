import { Approvals } from "@/components/admin/approvals/approvals";

// Approvals of the selected website (owner and the website's clients; designers are stopped
// by the shell route check and get 403 from the API).
export default function ApprovalsPage() {
  return <Approvals />;
}
