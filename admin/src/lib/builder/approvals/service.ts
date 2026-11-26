import "server-only";
import type { Role } from "../access";
import { aiComplete, aiEnabled, aiMockEnv } from "../ai";
import { readProject, StoreError } from "../server";
import { mediaBytes } from "../social/render";
import "./register";
import { approvalProvider, approvalProviders, type ApprovalContext } from "./providers";
import { addHistory, approvalsStore, findItem, readApprovals } from "./store";
import {
  APPROVAL_STATUSES,
  APPROVAL_TYPES,
  CALLBACK,
  type ApprovalItem,
  type ApprovalSettings,
  type ApprovalsOverview,
  type ApprovalStatus,
  type ApprovalType,
} from "./shared";
import { TEST_CHAT, siteBot, transportFor, webhookSecrets, type Transport } from "./telegram";

// The approvals service: the same Approve / Skip / Edit for the dashboard and Telegram.

const EDIT_WINDOW = 30 * 60_000; // the instruction must come within 30 minutes
const POLL_LEASE = 45_000;

const ctxFor = (settings: ApprovalSettings, by: string, role: Role): ApprovalContext => ({ by, role, mock: settings.testMode });

// ---- time helpers (website time zone) ----
async function timeZone(siteId: string) {
  try {
    return (await readProject(siteId)).website?.timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
function localHour(zone: string, now = new Date()) {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: zone }).format(now));
  } catch {
    return now.getUTCHours();
  }
}
function localDay(zone: string, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
export function inQuietHours(settings: Pick<ApprovalSettings, "quiet" | "quietFrom" | "quietTo">, hour: number) {
  if (!settings.quiet || settings.quietFrom === settings.quietTo) return false;
  return settings.quietFrom < settings.quietTo
    ? hour >= settings.quietFrom && hour < settings.quietTo
    : hour >= settings.quietFrom || hour < settings.quietTo;
}

// ---- overview ----
export async function overview(siteId: string, isOwner: boolean, baseUrl: string): Promise<ApprovalsOverview> {
  await syncProviders(siteId);
  const data = await readApprovals(siteId);
  const bot = await siteBot(siteId).catch(() => null);
  const counts = Object.fromEntries(APPROVAL_STATUSES.map((s) => [s, 0])) as Record<ApprovalStatus, number>;
  for (const item of data.items) counts[item.status]++;
  const publicUrl = /^https:\/\//.test(baseUrl);
  const secrets = webhookSecrets(siteId);
  return {
    items: data.items,
    settings: data.settings,
    counts,
    telegram: {
      connected: data.settings.testMode || (!!bot?.token && !!bot.chatId),
      botName: data.settings.testMode ? "@test_approvals_bot (test mode)" : bot?.botName || "",
      chatId: data.settings.testMode ? TEST_CHAT : bot?.chatId || "",
      mode: data.telegram.webhook ? "webhook" : data.telegram.poller && Date.parse(data.telegram.poller.until) > Date.now() ? "polling" : "off",
      webhookUrl: isOwner ? `${baseUrl.replace(/\/$/, "")}/api/telegram/approvals/${siteId}/${secrets.path}` : undefined,
      testSecret: isOwner && data.settings.testMode ? secrets.header : undefined,
      publicUrl,
      awaiting: data.telegram.awaiting && Date.parse(data.telegram.awaiting.until) > Date.now()
        ? { itemId: data.telegram.awaiting.itemId, until: data.telegram.awaiting.until }
        : undefined,
      lastError: data.telegram.lastError,
    },
    types: (Object.keys(APPROVAL_TYPES) as ApprovalType[]).map((type) => {
      const p = approvalProvider(type);
      return { type, label: APPROVAL_TYPES[type], ready: !!p && (p.ready?.() ?? true), note: p?.note };
    }),
    outbox: isOwner && data.settings.testMode ? data.outbox ?? [] : undefined,
    isOwner,
  };
}

// Providers that pull from their module (SEO assistant, onboarding) add new items here.
export async function syncProviders(siteId: string) {
  let added = 0;
  for (const p of approvalProviders())
    if (p.sync && (p.ready?.() ?? true)) added += await p.sync(siteId).catch(() => 0);
  return added;
}

// ---- actions ----
// Marks the item "working" (ignores double clicks), returns a copy + settings.
async function claim(siteId: string, id: string, allowed: ApprovalStatus[]) {
  return approvalsStore(siteId, (data) => {
    const item = findItem(data, id);
    if (!allowed.includes(item.status))
      throw new StoreError(
        item.status === "working" ? "This item is being processed." : `This item is already ${item.status}.`,
        409,
      );
    item.previous = item.status;
    item.status = "working";
    return { item: structuredClone(item), settings: data.settings };
  });
}
async function finish(siteId: string, id: string, change: (item: ApprovalItem) => void) {
  return approvalsStore(siteId, (data) => {
    const item = findItem(data, id);
    change(item);
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  });
}
async function fail(siteId: string, id: string, by: string, error: unknown) {
  const message = error instanceof StoreError ? error.message : "Something went wrong.";
  await finish(siteId, id, (item) => {
    item.status = item.previous && item.previous !== "working" ? item.previous : "pending";
    item.error = message;
    addHistory(item, by, `Failed: ${message}`);
  }).catch(() => {});
  return message;
}

export async function decide(siteId: string, id: string, action: "approve" | "skip", by: string, role: Role = "client") {
  const { item, settings } = await claim(siteId, id, ["pending", "revising", "failed"]);
  const provider = approvalProvider(item.type);
  try {
    if (!provider) throw new StoreError("This kind of item cannot be handled yet.", 501);
    const ctx = ctxFor(settings, by, role);
    const result =
      action === "approve" ? await provider.apply(item, ctx) : ((await provider.skip(item, ctx)) || "Skipped.");
    const done = await finish(siteId, id, (i) => {
      i.status = action === "approve" ? "approved" : "skipped";
      i.result = result;
      delete i.error;
      addHistory(i, by, `${action === "approve" ? "Approved" : "Skipped"}: ${result}`);
    });
    await clearAwaiting(siteId, id);
    await closeTelegramMessage(siteId, done, action === "approve" ? `✅ Approved. ${result}` : `⏭ Skipped.`);
    return done;
  } catch (error) {
    const message = await fail(siteId, id, by, error);
    throw error instanceof StoreError ? error : new StoreError(message, 500);
  }
}

// Edit from Telegram: wait for the instruction from this chat.
export async function startEdit(siteId: string, id: string, chatId: string, by: string) {
  return approvalsStore(siteId, (data) => {
    const item = findItem(data, id);
    if (!["pending", "revising", "failed"].includes(item.status))
      throw new StoreError(`This item is already ${item.status}.`, 409);
    item.status = "revising";
    addHistory(item, by, "Asked for changes");
    data.telegram.awaiting = { chatId, itemId: id, until: new Date(Date.now() + EDIT_WINDOW).toISOString() };
    return structuredClone(item);
  });
}
async function clearAwaiting(siteId: string, itemId?: string) {
  await approvalsStore(siteId, (data) => {
    if (!itemId || data.telegram.awaiting?.itemId === itemId) delete data.telegram.awaiting;
  });
}

// Edit: new variant following the instruction, then sent back with the same buttons.
export async function revise(siteId: string, id: string, instruction: string, by: string, role: Role = "client") {
  const text = instruction.trim().slice(0, 2000);
  if (!text) throw new StoreError("Write what to change.");
  const { item, settings } = await claim(siteId, id, ["pending", "revising", "failed"]);
  const provider = approvalProvider(item.type);
  try {
    if (!provider) throw new StoreError("This kind of item cannot be edited yet.", 501);
    const next = await provider.revise(item, text, ctxFor(settings, by, role));
    const updated = await finish(siteId, id, (i) => {
      i.text = next.text.slice(0, 8000);
      if (next.images) i.images = next.images.slice(0, 4);
      if (next.title) i.title = next.title.slice(0, 300);
      i.variant += 1;
      i.status = "pending";
      delete i.error;
      delete i.sentAt;
      addHistory(
        i,
        by,
        `Variant ${i.variant} after “${text.slice(0, 200)}”${next.cost ? ` (AI $${next.cost.toFixed(6)}, ${next.model})` : next.model === "mock" ? " (test AI)" : ""}`,
      );
    });
    await clearAwaiting(siteId, id);
    // The owner is waiting for it: sent right away (no digest, no quiet hours).
    await deliver(siteId, [updated], true).catch(() => 0);
    return updated;
  } catch (error) {
    const message = await fail(siteId, id, by, error);
    throw error instanceof StoreError ? error : new StoreError(message, 500);
  }
}

// ---- settings ----
export async function saveSettings(
  siteId: string,
  input: Partial<Omit<ApprovalSettings, "revision">> & { revision: number },
  isOwner: boolean,
) {
  return approvalsStore(siteId, (data) => {
    if (data.settings.revision !== input.revision)
      throw new StoreError("Settings were changed elsewhere. Refresh and try again.", 409);
    const { revision: _r, testMode, ...rest } = input;
    void _r;
    if (testMode !== undefined && testMode !== data.settings.testMode) {
      if (!isOwner) throw new StoreError("Only the administrator can switch test mode.", 403);
      data.settings.testMode = testMode;
      if (!testMode) delete data.outbox;
    }
    Object.assign(data.settings, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
    data.settings.revision++;
    return data.settings;
  });
}

// ---- Telegram delivery ----
const ICON: Record<ApprovalType, string> = {
  social_post: "📣",
  seo_suggestion: "🔎",
  text_review: "📝",
  weekly_report: "📊",
};
const buttons = (id: string) => ({
  inline_keyboard: [
    [
      { text: "✅ Approve", callback_data: `ap:a:${id}` },
      { text: "⏭ Skip", callback_data: `ap:s:${id}` },
      { text: "✏️ Edit", callback_data: `ap:e:${id}` },
    ],
  ],
});
export function messageText(item: ApprovalItem) {
  const head = `${ICON[item.type] ?? "•"} ${APPROVAL_TYPES[item.type] ?? item.type}${item.variant > 1 ? ` · variant ${item.variant}` : ""}\n${item.title}`;
  return `${head}\n\n${item.text}`.trim();
}

async function sendItem(siteId: string, t: Transport, chatId: string, item: ApprovalItem) {
  const text = messageText(item);
  const ids: number[] = [];
  const image = item.images[0];
  let bytes: Buffer | null = null;
  if (image) bytes = t.mock ? Buffer.from("x") : await mediaBytes(siteId, image).catch(() => null);
  if (bytes && text.length <= 1000) {
    ids.push((await t.photo({ chat_id: chatId, caption: text, reply_markup: buttons(item.id) }, bytes, "preview.jpg")).message_id);
  } else {
    if (bytes) ids.push((await t.photo({ chat_id: chatId }, bytes, "preview.jpg")).message_id);
    const sent = await t.call<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text: text.slice(0, 4000),
      reply_markup: buttons(item.id),
      disable_web_page_preview: true,
    });
    ids.push(sent.message_id);
  }
  return ids;
}

// Sends the given items now (they must be pending). Claims them first so two dispatches
// never send the same item twice.
async function deliver(siteId: string, items: ApprovalItem[], force = false) {
  const data = await readApprovals(siteId);
  if (!force && !data.settings.telegram) return 0;
  if (!data.settings.telegram && !data.settings.testMode) return 0;
  const target = await transportFor(siteId, data.settings.testMode);
  if (!target) return 0;
  const now = new Date().toISOString();
  const ids = new Set(items.map((i) => i.id));
  const claimed = await approvalsStore(siteId, (d) =>
    d.items
      .filter((i) => ids.has(i.id) && i.status === "pending" && !i.sentAt)
      .map((i) => {
        i.sentAt = now;
        return structuredClone(i);
      }),
  );
  let sent = 0;
  for (const item of claimed) {
    try {
      const messageIds = await sendItem(siteId, target.transport, target.chatId, item);
      await finish(siteId, item.id, (i) => {
        // Buttons of the previous variant are removed below; keep the newest ids.
        i.telegram = { chatId: target.chatId, messageIds };
      });
      if (item.telegram?.messageIds.length)
        await removeButtons(target.transport, item.telegram.chatId, item.telegram.messageIds.at(-1)!);
      sent++;
    } catch (error) {
      await approvalsStore(siteId, (d) => {
        const i = d.items.find((x) => x.id === item.id);
        if (i) delete i.sentAt;
        d.telegram.lastError = error instanceof StoreError ? error.message : "Telegram error.";
      });
    }
  }
  if (sent) await approvalsStore(siteId, (d) => void delete d.telegram.lastError);
  return sent;
}
async function removeButtons(t: Transport, chatId: string, messageId: number) {
  await t
    .call("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
    .catch(() => {});
}
async function closeTelegramMessage(siteId: string, item: ApprovalItem, line: string) {
  if (!item.telegram?.messageIds.length) return;
  const data = await readApprovals(siteId);
  const target = await transportFor(siteId, data.settings.testMode).catch(() => null);
  if (!target) return;
  await removeButtons(target.transport, item.telegram.chatId, item.telegram.messageIds.at(-1)!);
  await target.transport
    .call("sendMessage", {
      chat_id: item.telegram.chatId,
      text: `${line}\n${item.title}`.slice(0, 4000),
      reply_to_message_id: item.telegram.messageIds.at(-1),
      allow_sending_without_reply: true,
    })
    .catch(() => {});
}

// Sends what is due according to the settings: instant or the daily digest, outside quiet hours.
export async function dispatch(siteId: string, now = new Date()) {
  const data = await readApprovals(siteId);
  const { settings } = data;
  if (!settings.telegram) return 0;
  const due = data.items.filter((i) => i.status === "pending" && !i.sentAt).reverse(); // oldest first
  if (!due.length) return 0;
  const zone = await timeZone(siteId);
  const hour = localHour(zone, now);
  if (inQuietHours(settings, hour)) return 0;
  if (settings.delivery === "daily") {
    const today = localDay(zone, now);
    if (hour < settings.digestHour || data.telegram.lastDigest === today) return 0;
    const target = await transportFor(siteId, settings.testMode);
    if (!target) return 0;
    await approvalsStore(siteId, (d) => void (d.telegram.lastDigest = today));
    await target.transport
      .call("sendMessage", {
        chat_id: target.chatId,
        text: `Daily summary: ${due.length} ${due.length === 1 ? "item is" : "items are"} waiting for your approval.`,
      })
      .catch(() => {});
  }
  return deliver(siteId, due.slice(0, 20));
}

// ---- incoming updates (webhook or polling) ----
interface TgUser {
  id: number;
  first_name?: string;
  username?: string;
}
interface TgMessage {
  message_id: number;
  chat: { id: number };
  from?: TgUser;
  text?: string;
  voice?: { file_id: string; duration?: number; file_size?: number; mime_type?: string };
  audio?: { file_id: string; duration?: number; file_size?: number; mime_type?: string };
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; data?: string; message?: TgMessage };
}

async function allowedChats(siteId: string, settings: ApprovalSettings) {
  const chats = new Set(settings.extraChats);
  if (settings.testMode) chats.add(TEST_CHAT);
  else {
    const bot = await siteBot(siteId).catch(() => null);
    if (bot?.chatId) chats.add(bot.chatId);
  }
  return chats;
}
const who = (user?: TgUser) => `Telegram: ${user?.first_name || (user?.username ? `@${user.username}` : "owner")}`;

// Handles one update. Returns what happened (for tests / logs; no secrets).
export async function handleUpdate(siteId: string, update: TgUpdate): Promise<string> {
  // Duplicate deliveries are ignored.
  const fresh = await approvalsStore(siteId, (d) => {
    const handled = (d.telegram.handled ??= []);
    if (handled.includes(update.update_id)) return false;
    handled.push(update.update_id);
    d.telegram.handled = handled.slice(-200);
    return true;
  });
  if (!fresh) return "duplicate";
  const data = await readApprovals(siteId);
  const target = await transportFor(siteId, data.settings.testMode);
  if (!target) return "no bot";
  const t = target.transport;
  const allowed = await allowedChats(siteId, data.settings);

  const cb = update.callback_query;
  if (cb) {
    const chatId = String(cb.message?.chat.id ?? "");
    if (!allowed.has(chatId)) {
      await t.call("answerCallbackQuery", { callback_query_id: cb.id, text: "Not allowed." }).catch(() => {});
      return "ignored: chat not allowed";
    }
    const match = CALLBACK.exec(cb.data || "");
    if (!match) {
      await t.call("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});
      return "ignored: unknown button";
    }
    const [, code, id] = match;
    const by = who(cb.from);
    try {
      if (code === "e") {
        await startEdit(siteId, id, chatId, by);
        await t.call("answerCallbackQuery", { callback_query_id: cb.id, text: "What should I change?" });
        await t.call("sendMessage", {
          chat_id: chatId,
          text: "✏️ Write or say (voice message) what to change — I will send a new variant.",
          reply_to_message_id: cb.message?.message_id,
          allow_sending_without_reply: true,
        });
        return "edit: waiting for instruction";
      }
      await t.call("answerCallbackQuery", { callback_query_id: cb.id, text: code === "a" ? "Working on it…" : "Skipped" });
      await decide(siteId, id, code === "a" ? "approve" : "skip", by);
      return code === "a" ? "approved" : "skipped";
    } catch (error) {
      const message = error instanceof StoreError ? error.message : "Something went wrong.";
      await t.call("answerCallbackQuery", { callback_query_id: cb.id, text: message.slice(0, 190) }).catch(() => {});
      if (cb.message) await removeButtons(t, chatId, cb.message.message_id).catch(() => {});
      if (!/already|being processed|no longer/.test(message))
        await t.call("sendMessage", { chat_id: chatId, text: `⚠️ ${message}` }).catch(() => {});
      return `error: ${message}`;
    }
  }

  const msg = update.message;
  if (!msg) return "ignored: no message";
  const chatId = String(msg.chat.id);
  if (!allowed.has(chatId)) return "ignored: chat not allowed";
  const awaiting = data.telegram.awaiting;
  if (!awaiting || awaiting.chatId !== chatId || Date.parse(awaiting.until) < Date.now()) {
    const waiting = data.items.filter((i) => i.status === "pending").length;
    await t.call("sendMessage", {
      chat_id: chatId,
      text:
        msg.text?.startsWith("/start")
          ? `Hi! Things to approve will come here with the buttons Approve, Skip and Edit. Waiting now: ${waiting}.`
          : "To change something, press ✏️ Edit under that item first, then write or say what to change.",
    });
    return "ignored: no edit in progress";
  }
  const by = who(msg.from);
  let instruction = msg.text?.trim() || "";
  const voice = msg.voice || msg.audio;
  if (!instruction && voice) {
    try {
      instruction = await transcribe(siteId, t, voice, data.settings.testMode);
    } catch (error) {
      await t.call("sendMessage", {
        chat_id: chatId,
        text: `🎙 ${error instanceof StoreError ? error.message : "Could not understand the voice message."} Please type what to change.`,
      });
      return "voice: failed";
    }
    await t.call("sendMessage", { chat_id: chatId, text: `🎙 I heard: “${instruction.slice(0, 500)}”. Making a new variant…` });
  }
  if (!instruction) {
    await t.call("sendMessage", { chat_id: chatId, text: "Write or say what to change." });
    return "ignored: empty";
  }
  try {
    await revise(siteId, awaiting.itemId, instruction, by);
    return voice && !msg.text ? "revised from voice" : "revised";
  } catch (error) {
    await t.call("sendMessage", {
      chat_id: chatId,
      text: `⚠️ ${error instanceof StoreError ? error.message : "Could not make a new variant."}`,
    });
    return "revise failed";
  }
}

// Voice note → text through an audio-capable model on OpenRouter (chat completions
// `input_audio` part, format "ogg" for Telegram voice notes; model CMS_AI_AUDIO_MODEL or the
// default AI model). Test mode / CMS_AI_MOCK=1: a canned sentence, no cost.
async function transcribe(
  siteId: string,
  t: Transport,
  voice: { file_id: string; duration?: number; file_size?: number; mime_type?: string },
  mock: boolean,
) {
  if ((voice.duration ?? 0) > 180 || (voice.file_size ?? 0) > 5 * 1024 * 1024)
    throw new StoreError("The voice message is too long (3 minutes at most).");
  if (!mock && !aiMockEnv() && !aiEnabled()) throw new StoreError("Voice messages need the AI to be switched on.");
  const file = await t.call<{ file_path?: string }>("getFile", { file_id: voice.file_id });
  if (!file.file_path) throw new StoreError("Telegram did not give the file.");
  const bytes = await t.download(file.file_path);
  const ext = file.file_path.split(".").pop()?.toLowerCase() || "ogg";
  const format = ext === "oga" || ext === "opus" ? "ogg" : ext;
  const answer = await aiComplete({
    system: "You transcribe short voice messages from a business owner. Answer with the exact words only, in the language spoken. No comments.",
    user: "Transcribe this voice message.",
    audio: { data: bytes.toString("base64"), format },
    model: process.env.CMS_AI_AUDIO_MODEL || undefined,
    maxTokens: 400,
    useMock: mock,
    mock: "Make it shorter and add a question at the end",
  });
  void siteId;
  const text = answer.text.trim().replace(/^["“]|["”]$/g, "");
  if (!text) throw new StoreError("The voice message was empty.");
  return text.slice(0, 2000);
}

// Polling (local development, no public https address): one getUpdates round. Only one
// poller per bot: a lease in the approvals document; a second poller gets 409.
export async function pollOnce(siteId: string, pollerId: string, wait = 20) {
  const data = await readApprovals(siteId);
  if (data.telegram.webhook) throw new StoreError("A webhook is set for this bot. Switch it off to use polling.", 409);
  await approvalsStore(siteId, (d) => {
    const lease = d.telegram.poller;
    if (lease && lease.id !== pollerId && Date.parse(lease.until) > Date.now())
      throw new StoreError("Another poller is already running for this bot.", 409);
    d.telegram.poller = { id: pollerId, until: new Date(Date.now() + POLL_LEASE + wait * 1000).toISOString() };
  });
  const target = await transportFor(siteId, data.settings.testMode);
  if (!target) throw new StoreError("Connect the website's Telegram bot first (CRM → Settings).", 409);
  const updates = await target.transport.call<TgUpdate[]>("getUpdates", {
    offset: data.telegram.offset,
    timeout: target.transport.mock ? 0 : Math.max(0, Math.min(wait, 25)),
    allowed_updates: ["message", "callback_query"],
  });
  const results: string[] = [];
  for (const update of updates) {
    results.push(await handleUpdate(siteId, update).catch(() => "error"));
    await approvalsStore(siteId, (d) => void (d.telegram.offset = update.update_id + 1));
  }
  const sent = await dispatch(siteId).catch(() => 0);
  return { updates: updates.length, results, sent };
}
export async function stopPolling(siteId: string, pollerId: string) {
  await approvalsStore(siteId, (d) => {
    if (d.telegram.poller?.id === pollerId) delete d.telegram.poller;
  });
}

// Webhook on/off. setWebhook needs a public https address (Telegram requirement).
export async function setWebhook(siteId: string, baseUrl: string, on: boolean) {
  const data = await readApprovals(siteId);
  const target = await transportFor(siteId, data.settings.testMode);
  if (!target) throw new StoreError("Connect the website's Telegram bot first (CRM → Settings).", 409);
  if (on) {
    if (!/^https:\/\//.test(baseUrl))
      throw new StoreError("Telegram needs a public https address. Set the Website URL / NEXT_PUBLIC_SITE_URL first.", 409);
    const secrets = webhookSecrets(siteId);
    await target.transport.call("setWebhook", {
      url: `${baseUrl.replace(/\/$/, "")}/api/telegram/approvals/${siteId}/${secrets.path}`,
      secret_token: secrets.header,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  } else await target.transport.call("deleteWebhook", { drop_pending_updates: false });
  await approvalsStore(siteId, (d) => {
    d.telegram.webhook = on;
    if (on) delete d.telegram.poller;
  });
  return on;
}
