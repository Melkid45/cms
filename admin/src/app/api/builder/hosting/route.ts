import { errorResponse } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { authConfigured, localAccess } from "@/lib/builder/auth";
import { smtpReady } from "@/lib/builder/submissions";
export async function GET(request: Request) {
  try {
    const { site } = await authorizeSite(request, true);
    return Response.json(
      {
        database: !!process.env.DATABASE_URL,
        media: !!process.env.BLOB_READ_WRITE_TOKEN,
        authentication: authConfigured(),
        local: localAccess(),
        smtp: await smtpReady(site.id),
        hosted: !!process.env.VERCEL,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
