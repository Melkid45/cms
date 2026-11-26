import "server-only";
import { randomUUID } from "node:crypto";
import { withDoc } from "../doc-store";
import { StoreError } from "../server";
import {
  DEFAULT_APPROVAL_SETTINGS,
  type ApprovalItem,
  type ApprovalSettings,
  type ApprovalType,
  type OutboxEntry,
} from "./shared";

// One locked document per website: `approvals:{siteId}` (Postgres row or
// .data/approvals-{siteId}.json). Never call another store from inside a callback:
// the local document queue is global, a nested call would wait for itself.
export interface ApprovalsDoc {
  items: ApprovalItem[];
  settings: ApprovalSettings;
  // Social auto-drafts: source keys already seen (baseline taken on the first publish).
  socialSeen?: string[];
  socialBaseline?: boolean;
  telegram: {
    // getUpdates offset (polling mode).
    offset?: number;
    // Recently handled update ids (Telegram retries webhooks).
    handled?: number[];
    // Edit flow: the next text/voice message from this chat is the instruction.
    awaiting?: { chatId: string; itemId: string; until: string };
    // Only one poller per bot: lease of the current poller.
    poller?: { id: string; until: string };
    webhook?: boolean;
    lastDigest?: string; // yyyy-mm-dd in the website time zone
    lastError?: string;
  };
  outbox?: OutboxEntry[]; // test mode only
}
const MAX_ITEMS = 1000;
const empty = (): ApprovalsDoc => ({
  items: [],
  settings: { ...DEFAULT_APPROVAL_SETTINGS },
  telegram: {},
});
export const approvalsStore = <T>(
  siteId: string,
  fn: (data: ApprovalsDoc) => T | Promise<T>,
  write = true,
) =>
  withDoc<ApprovalsDoc, T>(
    `approvals:${siteId}`,
    empty,
    (data) => {
      data.settings = { ...DEFAULT_APPROVAL_SETTINGS, ...data.settings };
      data.telegram ??= {};
      data.items ??= [];
      return fn(data);
    },
    write,
  );

export const readApprovals = (siteId: string) => approvalsStore(siteId, (d) => structuredClone(d), false);

export function findItem(data: ApprovalsDoc, id: string) {
  const item = data.items.find((i) => i.id === id);
  if (!item) throw new StoreError("This item no longer exists.", 404);
  return item;
}
export function addHistory(item: ApprovalItem, by: string, text: string) {
  item.history.unshift({ at: new Date().toISOString(), by, text: text.slice(0, 500) });
  item.history = item.history.slice(0, 50);
  item.updatedAt = new Date().toISOString();
}

// Adds an item unless one with the same key is still open (pending/revising). Returns the
// item (new or existing).
export async function enqueue(
  siteId: string,
  input: {
    type: ApprovalType;
    key: string;
    title: string;
    text: string;
    images?: string[];
    ref?: Record<string, string>;
    by?: string;
  },
) {
  return approvalsStore(siteId, (data) => {
    const open = data.items.find(
      (i) => i.key === input.key && (i.status === "pending" || i.status === "revising" || i.status === "working"),
    );
    if (open) return { item: structuredClone(open), created: false };
    const now = new Date().toISOString();
    const item: ApprovalItem = {
      id: randomUUID(),
      siteId,
      type: input.type,
      key: input.key.slice(0, 200),
      title: input.title.slice(0, 300) || "Untitled",
      text: input.text.slice(0, 8000),
      images: (input.images ?? []).slice(0, 4),
      ref: input.ref ?? {},
      status: "pending",
      variant: 1,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    addHistory(item, input.by || "System", "Prepared");
    data.items.unshift(item);
    // Oldest closed items go first when the list is full.
    if (data.items.length > MAX_ITEMS) {
      const closed = data.items
        .map((i, n) => ({ i, n }))
        .filter(({ i }) => i.status === "approved" || i.status === "skipped" || i.status === "failed");
      const drop = new Set(closed.slice(-(data.items.length - MAX_ITEMS)).map(({ i }) => i.id));
      data.items = data.items.filter((i) => !drop.has(i.id));
    }
    return { item: structuredClone(item), created: true };
  });
}
