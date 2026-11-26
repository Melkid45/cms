import "server-only";
import { withDoc } from "../doc-store";
import { StoreError } from "../server";
import { seal, unseal } from "../social/accounts";

// Telegram notifications of one website: the site owner's own bot (made in @BotFather,
// free) and the chat that receives messages. Stored in `crm-telegram:{siteId}`; the token is
// AES-256-GCM encrypted (same helper as the social tokens) and never returned, logged or
// put into an error message. Requests go only to api.telegram.org.

export const TELEGRAM_EVENTS = ["enquiry", "order", "task", "booking"] as const;
export type TelegramEvent = (typeof TELEGRAM_EVENTS)[number];
interface TelegramDoc {
  token?: string; // sealed
  botName?: string;
  chatId: string;
  events: Record<TelegramEvent, boolean>;
  revision: number;
  lastError?: string;
  lastSentAt?: string;
}
const empty = (): TelegramDoc => ({
  chatId: "",
  events: { enquiry: true, order: true, task: true, booking: true },
  revision: 0,
});
const store = <T>(siteId: string, fn: (d: TelegramDoc) => T | Promise<T>, write = true) =>
  withDoc<TelegramDoc, T>(`crm-telegram:${siteId}`, empty, fn, write);

export const TOKEN_PATTERN = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;
export const CHAT_PATTERN = /^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/;

export interface TelegramStatus {
  connected: boolean;
  botName: string;
  chatId: string;
  events: Record<TelegramEvent, boolean>;
  revision: number;
  lastError: string;
  lastSentAt: string;
}
export const telegramStatus = (siteId: string): Promise<TelegramStatus> =>
  store(
    siteId,
    (d) => ({
      connected: !!d.token && !!d.chatId,
      botName: d.botName || "",
      chatId: d.chatId,
      events: { ...empty().events, ...d.events },
      revision: d.revision,
      lastError: d.lastError || "",
      lastSentAt: d.lastSentAt || "",
    }),
    false,
  );

// One Bot API call. Errors carry only Telegram's own description ("Unauthorized",
// "chat not found"), never the request URL (it contains the token).
async function call(token: string, method: string, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    throw new StoreError("Telegram did not answer. Try again later.", 502);
  }
  const data = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
  } | null;
  if (!data?.ok)
    throw new StoreError(
      `Telegram: ${String(data?.description || response.status).replace(/\d{5,15}:[A-Za-z0-9_-]{30,}/g, "***").slice(0, 200)}`,
      400,
    );
  return data.result;
}

// Saves the settings. A blank token keeps the saved one; a new token is checked with getMe.
export async function saveTelegram(
  siteId: string,
  input: { token?: string; chatId: string; events: Record<TelegramEvent, boolean>; revision: number; disconnect?: boolean },
) {
  let botName: string | undefined;
  if (input.token) {
    if (!TOKEN_PATTERN.test(input.token)) throw new StoreError("This does not look like a bot token from @BotFather.");
    const me = (await call(input.token, "getMe", {})) as { username?: string };
    botName = me.username ? `@${me.username}` : "";
  }
  await store(siteId, (d) => {
    if (d.revision !== input.revision)
      throw new StoreError("Telegram settings were changed elsewhere. Refresh and try again.", 409);
    if (input.disconnect) {
      delete d.token;
      delete d.botName;
      d.chatId = "";
    } else {
      if (input.token) {
        d.token = seal(input.token);
        d.botName = botName;
      }
      d.chatId = input.chatId;
      d.events = input.events;
    }
    delete d.lastError;
    d.revision++;
  });
  return telegramStatus(siteId);
}
async function savedToken(siteId: string) {
  const d = await store(siteId, (x) => x, false);
  if (!d.token) return null;
  try {
    return { token: unseal(d.token), chatId: d.chatId, events: { ...empty().events, ...d.events } };
  } catch {
    // The hosting secret changed: the owner has to paste the token again.
    return null;
  }
}
// Chats that wrote to the bot recently (getUpdates), so the owner does not need to look up
// the chat id: write /start to the bot, then press "Find my chat".
export async function detectChats(siteId: string, token?: string) {
  const useToken = token || (await savedToken(siteId))?.token;
  if (!useToken) throw new StoreError("Paste the bot token first.");
  if (!TOKEN_PATTERN.test(useToken)) throw new StoreError("This does not look like a bot token from @BotFather.");
  const updates = (await call(useToken, "getUpdates", { limit: 50, timeout: 0 })) as {
    message?: { chat: { id: number; title?: string; first_name?: string; last_name?: string; username?: string; type: string } };
    my_chat_member?: { chat: { id: number; title?: string; type: string } };
    channel_post?: { chat: { id: number; title?: string; type: string } };
  }[];
  const chats = new Map<string, string>();
  for (const u of updates) {
    const chat = u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat;
    if (!chat) continue;
    const c = chat as { id: number; title?: string; first_name?: string; last_name?: string; username?: string; type: string };
    chats.set(
      String(c.id),
      `${c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || "Chat"} (${c.type})`,
    );
  }
  return [...chats].map(([id, title]) => ({ id, title }));
}
export async function sendTelegram(
  siteId: string,
  event: TelegramEvent | "test",
  text: string,
  override?: { token?: string; chatId?: string },
) {
  const saved = await savedToken(siteId);
  const token = override?.token || saved?.token;
  const chatId = override?.chatId || saved?.chatId;
  if (!token || !chatId) {
    if (event === "test") throw new StoreError("Paste the bot token and the chat id first.");
    return false;
  }
  if (event !== "test" && saved && !saved.events[event]) return false;
  try {
    await call(token, "sendMessage", {
      chat_id: chatId,
      text: text.slice(0, 4000),
      disable_web_page_preview: true,
    });
    await store(siteId, (d) => {
      d.lastSentAt = new Date().toISOString();
      delete d.lastError;
    });
    return true;
  } catch (error) {
    const message = error instanceof StoreError ? error.message : "Telegram error.";
    await store(siteId, (d) => {
      d.lastError = message;
    }).catch(() => {});
    if (event === "test") throw error;
    return false;
  }
}
