import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { authorizeOnboarding } from "@/lib/builder/onboarding/store";
import { viewOf } from "@/lib/builder/onboarding/consult";
import { onboardingAction, runAction } from "@/lib/builder/onboarding/actions";

export const runtime = "nodejs";
// Building a draft or translating writes several pages with AI one after another.
export const maxDuration = 300;
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

// Onboarding autopilot (BUILDER.md → Onboarding autopilot). The client uses the private link
// (header x-onboarding-token, or the token of their website order); the team and the
// website's client accounts use their session.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { record, actor } = await authorizeOnboarding(request, id);
    return json({ ...(await viewOf(record)), viewer: actor.kind });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host))
      throw new StoreError("Invalid origin.", 403);
    const { actor } = await authorizeOnboarding(request, id);
    const parsed = onboardingAction.safeParse(await readJson(request, 64 * 1024));
    if (!parsed.success) throw new StoreError("Invalid request.");
    const result = await runAction(id, parsed.data, actor);
    return json({ ...result.view, viewer: actor.kind, token: result.token });
  } catch (error) {
    return errorResponse(error);
  }
}
