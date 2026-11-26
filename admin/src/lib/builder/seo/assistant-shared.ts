// AI SEO assistant (SEO pack): shared types and labels. Client-safe.
// Server logic: seo/assistant.ts; prompts: seo/assistant-prompts.ts; API /api/builder/seo/assistant.
import type { FieldTarget } from "./fields";

export const SUGGESTION_TYPES = {
  "meta-title": { label: "SEO title", bulk: true },
  "meta-description": { label: "Meta description", bulk: true },
  alt: { label: "Image alt text", bulk: true },
  faq: { label: "FAQ entries", bulk: false },
  heading: { label: "Question heading", bulk: false },
  h1: { label: "Main heading (H1)", bulk: false },
  lead: { label: "Short answer at the top", bulk: false },
  link: { label: "Internal links", bulk: false },
  translation: { label: "Untranslated text", bulk: false },
  date: { label: "Outdated year", bulk: false },
  mismatch: { label: "Languages disagree", bulk: false },
  "missing-translation": { label: "Missing translation", bulk: false },
} as const;
export type SuggestionType = keyof typeof SUGGESTION_TYPES;

// What one change does. "seo" = page.seo field; "field" = a section / card value;
// "faq-add" = new cards in an existing FAQ list; "section-add" = a new FAQ section.
export type ChangeTarget =
  | { kind: "seo"; field: "title" | "description" }
  | ({ kind: "field" } & FieldTarget)
  | {
      kind: "faq-add";
      sectionId: string;
      collection: string;
      items: { template: number; values: Record<string, string> }[];
    }
  | {
      kind: "section-add";
      variant: string;
      values: Record<string, string>;
      collection: string;
      items: { template: number; values: Record<string, string> }[];
      beforeSectionId?: string;
    };
export interface SuggestionChange {
  target: ChangeTarget;
  label: string; // "SEO title", "Image alt (hero)", "FAQ: 3 questions"
  before: string;
  after: string;
  editable: boolean; // plain text the reviewer may edit before approving
}
export type SuggestionStatus = "pending" | "approved" | "rejected" | "undone" | "stale";
export interface Suggestion {
  id: string;
  runId: string;
  createdAt: string;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  locale: string;
  type: SuggestionType;
  source: "ai" | "rule";
  risk: "low" | "medium" | "high"; // low = may be approved in bulk
  impact: "high" | "medium" | "low";
  reason: string;
  // Facts in the new text that do not appear on the website, length problems, etc.
  flags: string[];
  // Empty = advice only (nothing to apply automatically; approving marks it done).
  changes: SuggestionChange[];
  structural?: boolean; // adds a section: design roles only
  status: SuggestionStatus;
  decidedAt?: string;
  decidedBy?: string;
  published?: boolean;
  // Ids created by faq-add / section-add, for undo.
  created?: string[];
  revisions?: { at: string; by: string; instruction: string }[];
}
export interface AssistantSettings {
  monthly: boolean; // monthly cron run (no-op when off)
  budgetUsd: number; // per-website monthly AI budget
  maxPages: number; // pages per run (worst audit score first)
  testMode: boolean; // canned AI answers, no cost
  publish: boolean; // default of "publish after approving"
  report: boolean; // send the monthly report through the analytics weekly-report channels
}
export const DEFAULT_SETTINGS: AssistantSettings = {
  monthly: false,
  budgetUsd: 0.5,
  maxPages: 10,
  testMode: false,
  publish: true,
  report: true,
};
export interface AssistantRun {
  id: string;
  at: string;
  by: string;
  trigger: "manual" | "monthly";
  mock: boolean;
  pages: number;
  aiPages: number;
  cachedPages: number;
  calls: number;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  suggestions: number;
  stopped?: string; // budget reached, AI off…
  notes?: string[]; // AI answers that could not be used (start of the raw answer)
}
export interface MonthlyReport {
  month: string;
  generatedAt: string;
  scoreBefore: number | null;
  scoreAfter: number;
  changes: { pageTitle: string; locale: string; type: SuggestionType; label: string; before: string; after: string; at: string }[];
  pages: { pageId: string; title: string; views: number; prevViews: number; visitors: number; prevVisitors: number }[];
  next: { pageTitle: string; label: string; reason: string }[];
  cost: number;
  calls: number;
  pending: number;
  text: string;
}
export const riskLabel = { low: "Low risk", medium: "Check", high: "Review carefully" } as const;
