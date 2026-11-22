// Approvals: everything the system prepares automatically (social posts, SEO suggestions,
// onboarding texts, reports) waits here for the business owner's Approve / Skip / Edit.
// Client-safe types. Server: approvals/store.ts, service.ts, telegram.ts, providers in
// approvals/providers/*.

export const APPROVAL_TYPES = {
  social_post: "Social post",
  seo_suggestion: "SEO suggestion",
  text_review: "Text to review",
  weekly_report: "Weekly report",
} as const;
export type ApprovalType = keyof typeof APPROVAL_TYPES;

// pending = waiting for the owner; revising = the owner pressed Edit and the system waits
// for (or works on) the instruction; working = an action is running (double clicks are ignored).
export const APPROVAL_STATUSES = ["pending", "revising", "working", "approved", "skipped", "failed"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface ApprovalHistory {
  at: string;
  by: string;
  text: string;
}
export interface ApprovalItem {
  id: string;
  siteId: string;
  type: ApprovalType;
  // Stable key of the source thing, so the same thing is never queued twice
  // ("social:post:<id>", "seo:<suggestion id>").
  key: string;
  title: string;
  // What the owner reads: the caption, the suggested text, the report.
  text: string;
  // Media URLs of the website (renders, page pictures). The first one is sent as a photo.
  images: string[];
  // Reference to the source module's record (post id, suggestion id…).
  ref: Record<string, string>;
  status: ApprovalStatus;
  // 1 = first version; every Edit makes the next one.
  variant: number;
  // Status before "working" (restored when an action fails).
  previous?: ApprovalStatus;
  result?: string;
  error?: string;
  history: ApprovalHistory[];
  createdAt: string;
  updatedAt: string;
  // Telegram delivery of the current variant.
  sentAt?: string;
  telegram?: { chatId: string; messageIds: number[] };
}

export interface ApprovalSettings {
  // Send items to the website's Telegram bot (Settings → CRM → Telegram).
  telegram: boolean;
  // instant = each item as soon as it is ready; daily = all waiting items once a day.
  delivery: "instant" | "daily";
  digestHour: number; // 0–23, website time zone
  // Quiet hours (website time zone): nothing is sent from quietFrom to quietTo.
  quiet: boolean;
  quietFrom: number;
  quietTo: number;
  // Create a social post draft for every newly published product/work card or page.
  autoSocial: boolean;
  // More chats allowed to answer (the CRM notification chat is always allowed).
  extraChats: string[];
  // Test mode (super admin): Telegram calls are recorded instead of sent, AI answers are
  // canned (no cost). For trying the flow without a real bot.
  testMode: boolean;
  revision: number;
}
export const DEFAULT_APPROVAL_SETTINGS: ApprovalSettings = {
  telegram: true,
  delivery: "instant",
  digestHour: 9,
  quiet: true,
  quietFrom: 21,
  quietTo: 8,
  // Off until the owner/admin switches it on for the website (scripted site rebuilds would
  // otherwise fill Social posts with drafts).
  autoSocial: false,
  extraChats: [],
  testMode: false,
  revision: 0,
};

export interface OutboxEntry {
  at: string;
  method: string;
  body: Record<string, unknown>;
}

export interface ApprovalsOverview {
  items: ApprovalItem[];
  settings: ApprovalSettings;
  counts: Record<ApprovalStatus, number>;
  telegram: {
    connected: boolean; // the website's CRM bot token + chat are saved
    botName: string;
    chatId: string;
    mode: "webhook" | "polling" | "off";
    webhookUrl?: string; // super admin only
    // Test mode + super admin only: the secret_token header, so a test script can simulate Telegram.
    testSecret?: string;
    publicUrl: boolean; // a public https address exists for setWebhook
    awaiting?: { itemId: string; until: string };
    lastError?: string;
  };
  types: { type: ApprovalType; label: string; ready: boolean; note?: string }[];
  outbox?: OutboxEntry[]; // test mode, super admin only
  isOwner: boolean;
}

export const typeLabel = (type: string) => APPROVAL_TYPES[type as ApprovalType] ?? type;
export const statusLabel: Record<ApprovalStatus, string> = {
  pending: "Waiting",
  revising: "Editing",
  working: "Working…",
  approved: "Approved",
  skipped: "Skipped",
  failed: "Failed",
};
// Callback data of the inline buttons: "ap:<a|s|e>:<item id>" (≤ 64 bytes).
export const CALLBACK = /^ap:([ase]):([0-9a-f-]{36})$/;
