import { z } from "zod";
import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { crmAccess } from "@/lib/builder/crm/access";
import {
  CHAT_PATTERN,
  detectChats,
  sendTelegram,
  saveTelegram,
  telegramStatus,
  TOKEN_PATTERN,
} from "@/lib/builder/crm/telegram";

export const runtime = "nodejs";
// Telegram notifications of the selected website (owner and the website's clients).
// The token is write-only: GET never returns it.
const tests = new Map<string, number[]>();
function limitTests(siteId: string) {
  const now = Date.now();
  const recent = (tests.get(siteId) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) throw new StoreError("Too many test messages. Wait a minute.", 429);
  recent.push(now);
  tests.set(siteId, recent);
}
const token = z.union([z.literal(""), z.string().trim().regex(TOKEN_PATTERN, "This does not look like a bot token from @BotFather.")]);
const chatId = z.union([z.literal(""), z.string().trim().regex(CHAT_PATTERN, "Chat id: a number like 123456789 or -100…, or @channel.")]);
export async function GET(request: Request) {
  try {
    const { site } = await crmAccess(request);
    return Response.json(await telegramStatus(site.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    const { site } = await crmAccess(request);
    const parsed = z
      .object({
        token: token.optional(),
        chatId,
        events: z.object({ enquiry: z.boolean(), order: z.boolean(), task: z.boolean(), booking: z.boolean().default(true) }).strict(),
        revision: z.number().int().nonnegative(),
        disconnect: z.boolean().optional(),
      })
      .strict()
      .safeParse(await readJson(request, 4000));
    if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message || "Check the settings.");
    return Response.json(await saveTelegram(site.id, parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
// {action:"test"} sends a test message (with the typed token/chat, or the saved ones);
// {action:"detect"} lists chats that wrote to the bot, to fill in the chat id.
export async function POST(request: Request) {
  try {
    const { site } = await crmAccess(request);
    const parsed = z
      .object({ action: z.enum(["test", "detect"]), token: token.optional(), chatId: chatId.optional() })
      .strict()
      .safeParse(await readJson(request, 4000));
    if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message || "Check the settings.");
    limitTests(site.id);
    if (parsed.data.action === "detect")
      return Response.json({ chats: await detectChats(site.id, parsed.data.token || undefined) });
    await sendTelegram(
      site.id,
      "test",
      `Test message from ${site.name}: notifications about new enquiries, orders and due tasks will arrive here.`,
      { token: parsed.data.token || undefined, chatId: parsed.data.chatId || undefined },
    );
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
