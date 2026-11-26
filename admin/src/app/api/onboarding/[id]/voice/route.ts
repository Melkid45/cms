import { errorResponse, StoreError } from "@/lib/builder/server";
import { authorizeOnboarding } from "@/lib/builder/onboarding/store";
import { transcribe } from "@/lib/builder/onboarding/actions";

export const runtime = "nodejs";
export const maxDuration = 90;
// Voice answer/comment: the browser sends a 16 kHz mono WAV (body, max 4 MB, about 2 minutes);
// the answer is the transcript, which the client checks before sending.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host))
      throw new StoreError("Invalid origin.", 403);
    const { record } = await authorizeOnboarding(request, id);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024) {
          await reader.cancel();
          throw new StoreError("The recording is too long (2 minutes at most).", 413);
        }
        chunks.push(value);
      }
    const language = new URL(request.url).searchParams.get("lang") || record.brief?.languages[0];
    const text = await transcribe(
      id,
      Buffer.concat(chunks),
      language && /^[a-z]{2}$/.test(language) ? language : undefined,
    );
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
