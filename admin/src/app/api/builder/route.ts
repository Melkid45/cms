import {
  readProject,
  writeProject,
  authorizeWrite,
  errorResponse,
} from "@/lib/builder/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await authorizeWrite(request);
    return Response.json(await readProject(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    const identity = await authorizeWrite(request);
    return Response.json(
      await writeProject(
        await request.json(),
        new URL(request.url).searchParams.get("publish") || undefined,
        identity.role,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
