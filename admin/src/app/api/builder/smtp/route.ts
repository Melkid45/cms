import { errorResponse, readJson } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import {
  readSmtpSettings,
  saveSmtpSettings,
  verifySmtp,
} from "@/lib/builder/smtp";
import { limitSmtpVerification } from "@/lib/builder/submissions";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    return Response.json(await readSmtpSettings(site.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    const { site } = await authorizeSite(request);
    return Response.json(
      await saveSmtpSettings(site.id, await readJson(request, 12000)),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const { identity, site } = await authorizeSite(request);
    await limitSmtpVerification(identity.id);
    return Response.json(await verifySmtp(site.id));
  } catch (e) {
    return errorResponse(e);
  }
}
