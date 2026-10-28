import {
  authConfigured,
  createSession,
  credentialsMatch,
  localAccess,
  ownerIdentity,
} from "@/lib/builder/auth";
import { accountLogin } from "@/lib/builder/accounts";
import { StoreError, errorResponse } from "@/lib/builder/server";
import { limitSignIn } from "@/lib/builder/submissions";
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    new URL(origin).host !==
      (request.headers.get("host") || new URL(request.url).host)
  )
    throw new StoreError("Cross-origin sign-in is not allowed.", 403);
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (localAccess()) return Response.json({ ok: true });
    if (process.env.NODE_ENV === "production" && !authConfigured())
      throw new StoreError(
        "Configure the owner email, password and authentication secret on the server.",
        503,
      );
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
    await limitSignIn(ip);
    const { email, password } = await request.json();
    const identity = credentialsMatch(email, password)
      ? ownerIdentity()
      : await accountLogin(email, password);
    if (!identity) throw new StoreError("Incorrect email or password.", 401);
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": `cms_session=${createSession(Date.now(), identity)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": `cms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
