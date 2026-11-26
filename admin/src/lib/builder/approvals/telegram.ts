import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { withDoc } from "../doc-store";
import { StoreError } from "../server";
import { unseal } from "../social/accounts";
import { approvalsStore } from "./store";

// Telegram transport of the approvals: the website's own bot from CRM settings
// (`crm-telegram:{siteId}`, token AES-256-GCM sealed, read here and never returned or
// logged). Test mode records every call in the approvals document instead of sending it.

export const TEST_CHAT = "100000001";

export interface SiteBot {
  token: string;
  chatId: string;
  botName: string;
}
// Reads the CRM bot (read-only; the CRM module owns this document).
export async function siteBot(siteId: string): Promise<SiteBot | null> {
  const doc = await withDoc<{ token?: string; chatId?: string; botName?: string }, { token?: string; chatId?: string; botName?: string }>(
    `crm-telegram:${siteId}`,
    () => ({}),
    (d) => ({ token: d.token, chatId: d.chatId, botName: d.botName }),
    false,
  );
  if (!doc.token) return null;
  try {
    return { token: unseal(doc.token), chatId: doc.chatId || "", botName: doc.botName || "" };
  } catch {
    return null; // the hosting secret changed: the owner pastes the token again
  }
}

const mask = (text: string) => text.replace(/\d{5,15}:[A-Za-z0-9_-]{30,}/g, "***").slice(0, 200);

export interface Transport {
  mock: boolean;
  call: <T = unknown>(method: string, body: Record<string, unknown>) => Promise<T>;
  // sendPhoto with uploaded bytes (works without a public image URL).
  photo: (body: Record<string, unknown>, bytes: Buffer, name: string) => Promise<{ message_id: number }>;
  download: (filePath: string) => Promise<Buffer>;
}

// Test transport: records calls, answers like Telegram would.
function mockTransport(siteId: string): Transport {
  const record = async (method: string, body: Record<string, unknown>) => {
    const id = await approvalsStore(siteId, (d) => {
      d.outbox ??= [];
      d.outbox.unshift({ at: new Date().toISOString(), method, body });
      d.outbox = d.outbox.slice(0, 60);
      return 1000 + d.outbox.length + Math.floor(Math.random() * 1e6);
    });
    return id;
  };
  return {
    mock: true,
    call: async <T,>(method: string, body: Record<string, unknown>) => {
      if (method === "getUpdates") return [] as T; // polling rounds are not worth recording
      const id = await record(method, body);
      if (method === "sendMessage" || method === "sendPhoto") return { message_id: id } as T;
      if (method === "getFile")
        return { file_id: body.file_id, file_path: "voice/test-note.oga", file_size: 1200 } as T;
      return true as T;
    },
    photo: async (body) => ({ message_id: await record("sendPhoto", { ...body, photo: "(uploaded bytes)" }) }),
    download: async () => Buffer.from("TEST-VOICE-BYTES"),
  };
}

function botTransport(token: string): Transport {
  const parse = async (response: Response) => {
    const data = (await response.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
    if (!data?.ok) throw new StoreError(`Telegram: ${mask(String(data?.description || response.status))}`, 400);
    return data.result;
  };
  const request = async (method: string, init: RequestInit, timeout = 10000) => {
    try {
      return await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        ...init,
        signal: AbortSignal.timeout(timeout),
        cache: "no-store",
      });
    } catch {
      throw new StoreError("Telegram did not answer. Try again later.", 502);
    }
  };
  return {
    mock: false,
    call: async <T,>(method: string, body: Record<string, unknown>) =>
      (await parse(
        await request(
          method,
          { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
          method === "getUpdates" ? 35000 : 10000,
        ),
      )) as T,
    photo: async (body, bytes, name) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(body)) form.append(k, typeof v === "string" ? v : JSON.stringify(v));
      form.append("photo", new Blob([new Uint8Array(bytes)]), name);
      return (await parse(await request("sendPhoto", { body: form }, 30000))) as { message_id: number };
    },
    download: async (filePath) => {
      if (!/^[\w./-]{1,200}$/.test(filePath)) throw new StoreError("Telegram file path is invalid.");
      let response: Response;
      try {
        response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
          signal: AbortSignal.timeout(20000),
          cache: "no-store",
        });
      } catch {
        throw new StoreError("Could not download the voice message.", 502);
      }
      if (!response.ok) throw new StoreError("Could not download the voice message.", 502);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024) throw new StoreError("The voice message is too long.");
      return bytes;
    },
  };
}

// The transport of a website: test mode → recorder; otherwise the CRM bot (null if none).
export async function transportFor(siteId: string, testMode: boolean) {
  if (testMode) return { transport: mockTransport(siteId), chatId: TEST_CHAT, botName: "@test_approvals_bot" };
  const bot = await siteBot(siteId);
  if (!bot || !bot.chatId) return null;
  return { transport: botTransport(bot.token), chatId: bot.chatId, botName: bot.botName };
}

// Webhook secrets, derived per website from CMS_AUTH_SECRET: a secret path segment and the
// `secret_token` Telegram repeats in X-Telegram-Bot-Api-Secret-Token on every call.
function secretKey() {
  const secret = process.env.CMS_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV !== "development")
    throw new StoreError("Configure CMS_AUTH_SECRET first.", 503);
  return secret || "local-development-only";
}
export function webhookSecrets(siteId: string) {
  const mac = (purpose: string) => createHmac("sha256", secretKey()).update(`approvals:${purpose}:${siteId}`).digest("hex");
  return { path: mac("path").slice(0, 32), header: mac("header").slice(0, 48) };
}
export function checkWebhook(siteId: string, path: string, header: string | null) {
  const expected = webhookSecrets(siteId);
  const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  return same(path, expected.path) && !!header && same(header, expected.header);
}
