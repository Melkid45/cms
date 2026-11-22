import "server-only";
import type { Role } from "../access";
import type { ApprovalItem, ApprovalType } from "./shared";

// A provider connects one item type to the module that owns the real thing (the social
// post, the SEO suggestion…). Approvals never change that module's data itself.
export interface ApprovalContext {
  by: string; // person shown in histories ("Owner", "Telegram: Anna")
  // Role the action runs with: the dashboard user's role; Telegram = "client" (the business
  // owner's rights, never more).
  role: Role;
  // Test mode of the website: canned AI answers, no cost. Set only from the stored
  // settings, never from browser or Telegram input.
  mock: boolean;
}
export interface Revision {
  text: string;
  images?: string[];
  title?: string;
  cost?: number;
  model?: string;
}
export interface ApprovalProvider {
  type: ApprovalType;
  // Approve: do the real thing (publish the post, apply the suggestion). Returns a short
  // result line for the owner.
  apply(item: ApprovalItem, ctx: ApprovalContext): Promise<string>;
  skip(item: ApprovalItem, ctx: ApprovalContext): Promise<string | void>;
  // Edit: make a new variant following the owner's instruction (uses aiComplete).
  revise(item: ApprovalItem, instruction: string, ctx: ApprovalContext): Promise<Revision>;
  // Optional: pull waiting items from the source module (SEO assistant, onboarding).
  sync?(siteId: string): Promise<number>;
  // Shown on the dashboard: is this provider wired to its source yet?
  ready?: () => boolean;
  note?: string;
}
const registry = globalThis as typeof globalThis & {
  approvalProviders?: Map<ApprovalType, ApprovalProvider>;
};
export function registerApprovalProvider(provider: ApprovalProvider) {
  (registry.approvalProviders ??= new Map()).set(provider.type, provider);
}
export const approvalProvider = (type: ApprovalType) => registry.approvalProviders?.get(type);
export const approvalProviders = () => [...(registry.approvalProviders?.values() ?? [])];
