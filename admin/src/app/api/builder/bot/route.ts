import { validBotSignature } from "@/lib/builder/bot-signature";
import {
  database,
  readProject,
  writeProject,
  StoreError,
  errorResponse,
} from "@/lib/builder/server";
import { storeMedia } from "@/lib/builder/media";
import { listAccounts, saveAccount } from "@/lib/builder/accounts";
import {
  newClientAccount,
  clientAccountChange,
} from "@/lib/builder/account-input";
export const runtime = "nodejs";
const localNonces = new Map<string, number>();
async function handle(request: Request) {
  try {
    const key = process.env.CMS_BOT_PUBLIC_KEY;
    if (!key) throw new StoreError("Bot access is not configured.", 503);
    const url = new URL(request.url);
    const timestamp = request.headers.get("x-harbstone-time") || "",
      nonce = request.headers.get("x-harbstone-nonce") || "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = request.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 12 * 1024 * 1024) {
          await reader.cancel();
          throw new StoreError("Request is too large.", 413);
        }
        chunks.push(value);
      }
    }
    const bytes = Buffer.concat(chunks);
    if (
      !validBotSignature({
        method: request.method,
        path: url.pathname + url.search,
        timestamp,
        nonce,
        body: bytes,
        signature: request.headers.get("x-harbstone-signature") || "",
        publicKey: key,
      })
    )
      throw new StoreError("Invalid or expired bot signature.", 401);
    const sql = await database();
    if (sql) {
      await sql`DELETE FROM harbstone_bot_nonces WHERE expires_at < now()`;
      const rows =
        await sql`INSERT INTO harbstone_bot_nonces(nonce,expires_at) VALUES (${nonce}, now()+interval '2 minutes') ON CONFLICT DO NOTHING RETURNING nonce`;
      if (!rows.length)
        throw new StoreError("This bot request was already used.", 401);
    } else {
      const now = Date.now();
      for (const [id, time] of localNonces)
        if (time < now) localNonces.delete(id);
      if (localNonces.has(nonce))
        throw new StoreError("This bot request was already used.", 401);
      localNonces.set(nonce, now + 120000);
    }
    if (url.searchParams.get("resource") === "accounts") {
      if (url.searchParams.get("actor") !== "super-admin")
        throw new StoreError("Only the super admin can manage accounts.", 403);
      if (request.method === "GET")
        return Response.json(await listAccounts(), {
          headers: { "Cache-Control": "no-store" },
        });
      if (!["POST", "PATCH"].includes(request.method))
        return new Response(null, { status: 405 });
      if (bytes.length > 12000)
        throw new StoreError("Request is too large.", 413);
      let input: unknown;
      try {
        input = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new StoreError("Invalid account data.");
      }
      if (request.method === "PATCH") {
        const update = clientAccountChange.safeParse(input);
        if (!update.success)
          throw new StoreError(
            "Choose a client account and a valid password or access status.",
          );
        return Response.json(await saveAccount(update.data));
      }
      const parsed = newClientAccount.safeParse(input);
      if (!parsed.success)
        throw new StoreError(
          "Enter a name, valid email and a password of 12–256 characters.",
        );
      return Response.json(await saveAccount(parsed.data), { status: 201 });
    }
    if (request.method === "GET")
      return Response.json(await readProject(), {
        headers: { "Cache-Control": "no-store" },
      });
    if (request.method === "PUT") {
      let input;
      try {
        input = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new StoreError("Invalid project JSON.");
      }
      return Response.json(
        await writeProject(
          input,
          url.searchParams.get("publish") || undefined,
          url.searchParams.get("actor") === "super-admin"
            ? "super-admin"
            : "client",
        ),
      );
    }
    if (request.method !== "POST") return new Response(null, { status: 405 });
    return await storeMedia(
      new Request(request.url, {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") || "" },
        body: new Uint8Array(bytes).buffer,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const PUT = handle;
export const POST = handle;
export const PATCH = handle;
