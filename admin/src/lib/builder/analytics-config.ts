import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { withDoc } from "./doc-store";
import { StoreError } from "./server";

// Per-website analytics settings (BUILDER.md → Analytics → v2): goals defined in the
// dashboard and the weekly report delivery. One document "analytics-config:{site}".
export const goalTypes = ["page", "action", "form", "order", "booking"] as const;
export const goalActions = ["any", "phone", "email", "whatsapp", "telegram", "calculator"] as const;
export const goalInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(goalTypes),
    // page goal: the page; form / order goal: optional page (empty = whole website)
    page: z.string().max(100).optional(),
    action: z.enum(goalActions).optional(),
  })
  .strict()
  .refine((g) => g.type !== "page" || !!g.page, { message: "Choose the page of the goal." });
export type Goal = z.infer<typeof goalInput> & { id: string; createdAt: string };
export const weeklyInput = z
  .object({ email: z.boolean(), telegram: z.boolean() })
  .strict();
export interface AnalyticsConfig {
  goals: Goal[];
  weekly: {
    email: boolean;
    telegram: boolean;
    lastSent?: string; // yyyy-mm-dd of the last delivery
    lastResult?: string;
  };
}
const MAX_GOALS = 20;
const initial = (): AnalyticsConfig => ({ goals: [], weekly: { email: false, telegram: false } });
const docId = (siteId: string) => `analytics-config:${siteId}`;
const normal = (doc: AnalyticsConfig) => {
  doc.goals ??= [];
  doc.weekly ??= { email: false, telegram: false };
  return doc;
};

export const readAnalyticsConfig = (siteId: string) =>
  withDoc<AnalyticsConfig, AnalyticsConfig>(docId(siteId), initial, (doc) => normal(doc), false);

export const updateAnalyticsConfig = <T>(siteId: string, fn: (doc: AnalyticsConfig) => T) =>
  withDoc<AnalyticsConfig, T>(docId(siteId), initial, (doc) => fn(normal(doc)));

export const addGoal = (siteId: string, input: z.infer<typeof goalInput>) =>
  updateAnalyticsConfig(siteId, (doc) => {
    if (doc.goals.length >= MAX_GOALS) throw new StoreError(`Up to ${MAX_GOALS} goals per website.`);
    const goal: Goal = {
      ...input,
      ...(input.type === "action" ? { action: input.action || "any" } : { action: undefined }),
      ...(input.type === "page" || input.type === "form" || input.type === "order" || input.type === "booking"
        ? { page: input.page || undefined }
        : { page: undefined }),
      id: randomBytes(6).toString("hex"),
      createdAt: new Date().toISOString(),
    };
    doc.goals.push(JSON.parse(JSON.stringify(goal)));
    return goal;
  });

export const deleteGoal = (siteId: string, id: string) =>
  updateAnalyticsConfig(siteId, (doc) => {
    doc.goals = doc.goals.filter((g) => g.id !== id);
  });

export const setWeekly = (siteId: string, input: z.infer<typeof weeklyInput>) =>
  updateAnalyticsConfig(siteId, (doc) => {
    doc.weekly = { ...doc.weekly, ...input };
    return doc.weekly;
  });
