import {
  authorizeWrite,
  errorResponse,
  StoreError,
} from "@/lib/builder/server";
import {
  readSmtpSettings,
  saveSmtpSettings,
  verifySmtp,
} from "@/lib/builder/smtp";
import { limitSmtpVerification } from "@/lib/builder/submissions";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await authorizeWrite(request);
    return Response.json(await readSmtpSettings(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    await authorizeWrite(request);
    if (Number(request.headers.get("content-length") || 0) > 12000)
      throw new StoreError("Settings are too large.", 413);
    return Response.json(await saveSmtpSettings(await request.json()));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const identity = await authorizeWrite(request);
    await limitSmtpVerification(identity.id);
    return Response.json(await verifySmtp());
  } catch (e) {
    return errorResponse(e);
  }
}
