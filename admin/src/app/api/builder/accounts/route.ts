import { z } from "zod";
import {
  authorizeWrite,
  errorResponse,
  StoreError,
} from "@/lib/builder/server";
import { listAccounts, saveAccount } from "@/lib/builder/accounts";
const password = z.string().min(12).max(256);
export async function GET(request: Request) {
  try {
    await authorizeWrite(request, true);
    return Response.json(await listAccounts(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    await authorizeWrite(request, true);
    const value = z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z.email().max(254),
        password,
      })
      .strict()
      .safeParse(await request.json());
    if (!value.success)
      throw new StoreError(
        "Enter a name, valid email and a password of 12–256 characters.",
      );
    return Response.json(await saveAccount(value.data), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    await authorizeWrite(request, true);
    const value = z
      .object({
        id: z.string().min(1).max(100),
        password: password.optional(),
        disabled: z.boolean().optional(),
      })
      .strict()
      .safeParse(await request.json());
    if (
      !value.success ||
      (value.data.password === undefined && value.data.disabled === undefined)
    )
      throw new StoreError(
        "Choose an account and a password or access status.",
      );
    return Response.json(await saveAccount(value.data));
  } catch (e) {
    return errorResponse(e);
  }
}
