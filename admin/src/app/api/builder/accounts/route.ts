import {
  authorizeWrite,
  errorResponse,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import { listAccounts, saveAccount } from "@/lib/builder/accounts";
import { knownScope, newAccountScope } from "@/lib/builder/sites";
import {
  clientAccountChange,
  newClientAccount,
} from "@/lib/builder/account-input";
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
    const value = newClientAccount.safeParse(await readJson(request, 60000));
    if (!value.success)
      throw new StoreError(
        "Enter a name, valid email and a password of 12–256 characters.",
      );
    return Response.json(await saveAccount(await newAccountScope(value.data)), {
      status: 201,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    await authorizeWrite(request, true);
    const value = clientAccountChange.safeParse(await readJson(request, 60000));
    if (!value.success)
      throw new StoreError(
        "Choose an account and a password or access status.",
      );
    return Response.json(await saveAccount(await knownScope(value.data)));
  } catch (e) {
    return errorResponse(e);
  }
}
