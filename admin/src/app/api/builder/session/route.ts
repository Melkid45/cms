import {
  authConfigured,
  createSession,
  credentialsMatch,
  localRequest,
  ownerIdentity,
  sessionCookie,
} from "@/lib/builder/auth";
import { accountLogin } from "@/lib/builder/accounts";
import {
  StoreError,
  clientIp,
  errorResponse,
  readJson,
} from "@/lib/builder/server";
import { limitSignIn } from "@/lib/builder/submissions";
import { siteCookie } from "@/lib/builder/site-links";
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
    if (localRequest(request.headers)) return Response.json({ ok: true });
    if (process.env.NODE_ENV === "production" && !authConfigured())
      throw new StoreError(
        "Configure the owner email, password and authentication secret on the server.",
        503,
      );
    await limitSignIn(clientIp(request));
    const { email, password } = ((await readJson(request, 4000)) ?? {}) as {
      email?: unknown;
      password?: unknown;
    };
    const identity = credentialsMatch(email, password)
      ? ownerIdentity()
      : await accountLogin(email, password);
    if (!identity) throw new StoreError("Incorrect email or password.", 401);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append(
      "Set-Cookie",
      sessionCookie(request, createSession(Date.now(), identity), 43200),
    );
    // The owner starts in studio mode (all clients), not inside a remembered website.
    if (identity.role === "super-admin")
      headers.append("Set-Cookie", `${siteCookie}=; Path=/; Max-Age=0; SameSite=Lax`);
    return Response.json({ ok: true }, { headers });
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
          "Set-Cookie": sessionCookie(request, "", 0),
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
