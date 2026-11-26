import { after } from "next/server";
import { errorResponse } from "@/lib/builder/server";
import { crmAccess } from "@/lib/builder/crm/access";
import { overdueCount } from "@/lib/builder/crm/actions";
import { remindDueTasks } from "@/lib/builder/crm/events";

export const runtime = "nodejs";
// Overdue tasks for the menu badge (polled by the admin shell). Also sends the reminders of
// tasks that just became due, so reminders work without a frequent cron.
export async function GET(request: Request) {
  try {
    const { site, identity } = await crmAccess(request);
    after(() => remindDueTasks(site.id).catch(() => 0));
    return Response.json(await overdueCount(site.id, identity.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
