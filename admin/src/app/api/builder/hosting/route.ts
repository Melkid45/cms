import { authorizeWrite, errorResponse } from "@/lib/builder/server";
import { authConfigured, localAccess } from "@/lib/builder/auth";
import { smtpReady } from "@/lib/builder/submissions";
export async function GET(request: Request) {
  try {
    authorizeWrite(request);
    return Response.json(
      {
        database: !!process.env.DATABASE_URL,
        media: !!process.env.BLOB_READ_WRITE_TOKEN,
        authentication: authConfigured(),
        local: localAccess(),
        smtp: smtpReady(),
        hosted: !!process.env.VERCEL,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
