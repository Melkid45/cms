import { z } from "zod";
import {
  authorizeWrite,
  errorResponse,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import { changeOwnPassword } from "@/lib/builder/accounts";
import { createSession, sessionCookie } from "@/lib/builder/auth";
import { accountPassword } from "@/lib/builder/account-input";
import { limitPasswordChange } from "@/lib/builder/submissions";
const input = z
  .object({
    currentPassword: z.string().min(1).max(256),
    password: accountPassword,
  })
  .strict();
export async function POST(request: Request) {
  try {
    const user = await authorizeWrite(request);
    if (user.role !== "client")
      throw new StoreError(
        "The owner password is managed through hosting settings.",
        403,
      );
    await limitPasswordChange(user.id);
    const parsed = input.safeParse(await readJson(request, 4000));
    if (!parsed.success)
      throw new StoreError(
        "Enter your current password and a new password of at least 12 characters.",
      );
    const updated = await changeOwnPassword(
      user.id,
      user.version,
      parsed.data.currentPassword,
      parsed.data.password,
    );
    return Response.json(
      { ok: true },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": sessionCookie(
            request,
            createSession(Date.now(), updated),
            43200,
          ),
        },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
