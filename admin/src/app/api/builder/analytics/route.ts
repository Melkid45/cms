import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { analyticsReport, clickMap, liveNow, resetAnalytics } from "@/lib/builder/analytics";
import { addGoal, deleteGoal, goalInput, setWeekly, weeklyInput } from "@/lib/builder/analytics-config";
import { buildWeeklyReport, telegramReady } from "@/lib/builder/analytics-weekly";
import { mailConnection } from "@/lib/builder/smtp";
import { readProject } from "@/lib/builder/server";
export const runtime = "nodejs";

const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });
const period = (url: URL) => {
  const days = Number(url.searchParams.get("days") || 30);
  if (![7, 30, 90].includes(days)) throw new StoreError("Choose 7, 30 or 90 days.");
  return days;
};

// Analytics of the selected website: every account that may open the website.
// ?view=live → visitors of the last 5 minutes; ?view=clicks&page= → click map and scroll depth
// of a page; ?view=weekly → preview of the weekly report and its delivery channels.
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    if (view === "live") return json(await liveNow(site.id));
    if (view === "clicks") {
      const page = url.searchParams.get("page") || "";
      if (!page || page.length > 100) throw new StoreError("Choose a page.");
      return json(await clickMap(site.id, page, period(url)));
    }
    if (view === "weekly") {
      const report = await buildWeeklyReport(site.id);
      const project = await readProject(site.id);
      const smtp = await mailConnection(site.id)
        .then((c) => {
          c?.transport.close();
          return !!c;
        })
        .catch(() => false);
      return json({
        report,
        channels: {
          email: smtp && !!project.forms?.recipient,
          telegram: await telegramReady(site.id),
        },
      });
    }
    return json(await analyticsReport(site.id, period(url)));
  } catch (error) {
    return errorResponse(error);
  }
}
// Adds a goal (every account with access to the website).
export async function POST(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    const parsed = goalInput.safeParse(await readJson(request, 2000));
    if (!parsed.success)
      throw new StoreError(parsed.error.issues[0]?.message || "Check the goal.");
    return json({ goal: await addGoal(site.id, parsed.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
// Weekly report delivery switches (super admin).
export async function PATCH(request: Request) {
  try {
    const { site } = await authorizeSite(request, true);
    const parsed = weeklyInput.safeParse(await readJson(request, 1000));
    if (!parsed.success) throw new StoreError("Check the weekly report settings.");
    return json({ weekly: await setWeekly(site.id, parsed.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
// ?goal=id deletes a goal (every account with access); without it: reset analytics for this
// website (super admin only).
export async function DELETE(request: Request) {
  try {
    const goal = new URL(request.url).searchParams.get("goal");
    if (goal) {
      const { site } = await authorizeSite(request);
      await deleteGoal(site.id, goal);
      return json({ ok: true });
    }
    const { site } = await authorizeSite(request, true);
    await resetAnalytics(site.id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
