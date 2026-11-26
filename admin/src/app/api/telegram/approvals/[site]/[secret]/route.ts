import { after } from "next/server";
import { readJson } from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import { checkWebhook } from "@/lib/builder/approvals/telegram";
import { handleUpdate, type TgUpdate } from "@/lib/builder/approvals/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Telegram webhook of a website's bot for approvals: /api/telegram/approvals/{siteId}/{secret}.
// Both the secret path and Telegram's X-Telegram-Bot-Api-Secret-Token header must match
// (HMAC of CMS_AUTH_SECRET per website). Only chats saved for the website are served
// (checked in handleUpdate). Answers 200 at once; the work runs after the response.
export async function POST(request: Request, { params }: { params: Promise<{ site: string; secret: string }> }) {
  const { site: siteId, secret } = await params;
  if (!/^[a-z0-9]{1,40}$/.test(siteId) || !/^[a-f0-9]{32}$/.test(secret))
    return new Response("Not found", { status: 404 });
  if (!checkWebhook(siteId, secret, request.headers.get("x-telegram-bot-api-secret-token")))
    return new Response("Not found", { status: 404 });
  if (!(await readRegistry()).sites.some((s) => s.id === siteId)) return new Response("Not found", { status: 404 });
  let update: TgUpdate;
  try {
    update = (await readJson(request, 64 * 1024)) as TgUpdate;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!update || typeof update.update_id !== "number") return new Response("Bad request", { status: 400 });
  // ?wait=1 (tests): handle before answering and return what happened.
  if (new URL(request.url).searchParams.get("wait") === "1") {
    const result = await handleUpdate(siteId, update).catch((e) => `error: ${e instanceof Error ? e.message : ""}`);
    return Response.json({ ok: true, result });
  }
  after(() => handleUpdate(siteId, update).catch(() => "error"));
  return Response.json({ ok: true });
}
