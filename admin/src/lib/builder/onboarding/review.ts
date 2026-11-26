import "server-only";
import { readProject, StoreError, writeProject } from "../server";
import { readRegistry } from "../sites";
import { definition } from "../catalog";
import type { Section } from "../types";
import { PLACEHOLDER, type Onboarding, type ReviewItem } from "./shared";
import { applyAnswer, sectionSpec, sectionTexts, type SectionAnswer } from "./content";
import { briefForAi, WRITING_RULES } from "./generate";
import { changeRecord, logEvent, onboardingStore, parseJson, readRecord, recordAi } from "./store";

const findItem = (record: Onboarding, itemId: string) => {
  const item = record.review.find((i) => i.id === itemId);
  if (!item) throw new StoreError("Review item not found.", 404);
  return item;
};
const push = (item: ReviewItem, event: ReviewItem["history"][number]) => {
  item.history.push(event);
  if (item.history.length > 30) item.history = item.history.slice(-30);
  item.updatedAt = event.at;
};
async function sectionOf(siteId: string, item: ReviewItem) {
  const project = await readProject(siteId);
  const page = project.pages.find((p) => p.id === item.pageId && !p.deletedAt);
  const section = page?.sections.find((s) => s.id === item.sectionId);
  if (!page || !section) throw new StoreError("This block is no longer on the page.", 404);
  return { project, page, section };
}
async function replaceSection(siteId: string, item: ReviewItem, next: Section) {
  const { project, page } = await sectionOf(siteId, item);
  page.sections = page.sections.map((s) => (s.id === next.id ? next : s));
  page.updatedAt = new Date().toISOString();
  await writeProject(project, undefined, "super-admin", { siteId });
}

// The client comments on one block ("write it shorter", "mention our terrace"): AI rewrites
// only that block's texts; the previous texts stay in the history (undo).
export async function requestChange(id: string, itemId: string, comment: string, by: string) {
  const text = comment.trim().slice(0, 2000);
  if (!text) throw new StoreError("Write what should change.");
  const record = await readRecord(id);
  if (!["review", "translation"].includes(record.step)) throw new StoreError("The website is not in review.", 409);
  const item = findItem(record, itemId);
  const { section } = await sectionOf(record.siteId, item);
  const brief = record.brief!;
  const spec = sectionSpec(section);
  const current = sectionTexts(section, item.locale === record.plan?.main ? "write" : "translate");
  const result = await recordAi(id, `revise block (${item.label})`, {
    system: `You edit ONE section of a small-business website following the client's comment. ${WRITING_RULES(item.locale, brief.tone)} Change only what the comment asks; keep everything else as it is. If the comment gives new facts, use them. Answer JSON: {"values": {"<field key>": "text"}, "lists": {"<list id>": [{"<field key>": "text"}]}} with ALL field keys and ALL list rows of the section (a list may get more or fewer rows when the comment asks for it).`,
    user: `Brief: ${briefForAi(brief)}\n\nSection fields: ${JSON.stringify(spec)}\n\nCurrent texts: ${JSON.stringify(current)}\n\nClient's comment: ${text}`,
    maxTokens: 2500,
    json: true,
    mock: () => {
      const values = { ...current.values };
      const first = Object.keys(values).find((k) => k.startsWith("heading")) ?? Object.keys(values)[0];
      if (first) values[first] = `${values[first]} (revised: ${text.slice(0, 40)})`;
      return JSON.stringify({ values, lists: current.lists });
    },
  });
  const answer = parseJson<SectionAnswer>(result.text);
  const next = applyAnswer(section, answer, item.locale === record.plan?.main ? "write" : "translate");
  await replaceSection(record.siteId, item, next);
  return changeRecord(id, (record) => {
    const item = findItem(record, itemId);
    const at = new Date().toISOString();
    push(item, { at, by, kind: "comment", text });
    push(item, { at, by: "AI", kind: "revision", before: { values: section.values, collections: section.collections } });
    item.version += 1;
    item.status = "pending";
    logEvent(record, `Block revised: ${item.label}`, by);
    return record;
  });
}
export async function undoRevision(id: string, itemId: string, by: string) {
  const record = await readRecord(id);
  const item = findItem(record, itemId);
  const last = [...item.history].reverse().find((e) => e.kind === "revision" && e.before);
  if (!last?.before) throw new StoreError("Nothing to undo.");
  const { section } = await sectionOf(record.siteId, item);
  await replaceSection(record.siteId, item, {
    ...section,
    values: last.before.values,
    collections: last.before.collections as Section["collections"],
  });
  return changeRecord(id, (record) => {
    const item = findItem(record, itemId);
    // The used snapshot is dropped, so a second undo goes one revision further back.
    const index = item.history.findLastIndex((e) => e.kind === "revision" && !!e.before);
    if (index >= 0) item.history[index] = { ...item.history[index], before: undefined };
    push(item, { at: new Date().toISOString(), by, kind: "undo" });
    item.version += 1;
    item.status = "pending";
    return record;
  });
}
// Approving every main-language block moves the website on to translation; approving every
// translated block makes it ready to publish.
export async function setApproval(id: string, itemIds: string[], approved: boolean, by: string) {
  return changeRecord(id, (record) => {
    if (!["review", "translation"].includes(record.step)) throw new StoreError("The website is not in review.", 409);
    for (const itemId of itemIds) {
      const item = findItem(record, itemId);
      if ((item.status === "approved") === approved) continue;
      item.status = approved ? "approved" : "pending";
      push(item, { at: new Date().toISOString(), by, kind: approved ? "approved" : "reopened" });
    }
    const main = record.plan?.main;
    if (record.step === "review" && record.review.filter((i) => i.locale === main).every((i) => i.status === "approved")) {
      record.step = "translation";
      record.messages.push({
        id: crypto.randomUUID(),
        role: "assistant",
        text:
          (record.brief?.languages.length ?? 1) > 1
            ? "Every block is approved. Next: translation into your other languages."
            : "Every block is approved. Your website is ready to publish.",
        at: new Date().toISOString(),
      });
      logEvent(record, "Main language approved", by);
    }
    return record;
  });
}

// ---- Approval items for other channels (Telegram approvals bot) ----
export interface ApprovalItem {
  id: string;
  onboardingId: string;
  siteId: string;
  siteKey: string;
  business: string;
  test: boolean;
  pageId: string;
  pageTitle: string;
  locale: string;
  sectionId: string;
  label: string;
  status: ReviewItem["status"];
  version: number;
  updatedAt: string;
  // Heading + first texts of the block (plain text, max 600 chars).
  preview: string;
  // Placeholders like [price] still to fill in.
  placeholders: string[];
  lastComment?: string;
  reviewUrl: string;
}
export async function listApprovalItems(filter: { status?: ReviewItem["status"] | "all"; siteId?: string } = {}) {
  const records = await onboardingStore((data) => data.items, false);
  const sites = (await readRegistry()).sites;
  const out: ApprovalItem[] = [];
  for (const record of records) {
    if (filter.siteId && record.siteId !== filter.siteId) continue;
    if (!["review", "translation"].includes(record.step)) continue;
    const items = record.review.filter((i) => (filter.status ?? "pending") === "all" || i.status === (filter.status ?? "pending"));
    if (!items.length) continue;
    const project = await readProject(record.siteId).catch(() => null);
    for (const item of items) {
      const page = project?.pages.find((p) => p.id === item.pageId);
      const section = page?.sections.find((s) => s.id === item.sectionId);
      const texts = section ? sectionTexts(section) : { values: {}, lists: {} };
      const flat = [
        ...Object.values(texts.values),
        ...Object.values(texts.lists).flatMap((rows) => rows.flatMap((r) => Object.values(r))),
      ].filter(Boolean);
      out.push({
        id: item.id,
        onboardingId: record.id,
        siteId: record.siteId,
        siteKey: sites.find((s) => s.id === record.siteId)?.key ?? "",
        business: record.business,
        test: record.test,
        pageId: item.pageId,
        pageTitle: page?.title ?? "",
        locale: item.locale,
        sectionId: item.sectionId,
        label: section ? `${page?.title} · ${definition(section.variant)?.label ?? section.variant}` : item.label,
        status: item.status,
        version: item.version,
        updatedAt: item.updatedAt,
        preview: flat.join("\n").slice(0, 600),
        placeholders: [...new Set(flat.join(" ").match(PLACEHOLDER) ?? [])].slice(0, 20),
        lastComment: [...item.history].reverse().find((e) => e.kind === "comment")?.text,
        reviewUrl: `/dashboard/onboarding/${record.id}?item=${item.id}`,
      });
    }
  }
  return out;
}
// Finds the onboarding record of a review item id (ids are unique across records).
export async function recordOfItem(itemId: string) {
  const records = await onboardingStore((data) => data.items, false);
  const record = records.find((r) => r.review.some((i) => i.id === itemId));
  if (!record) throw new StoreError("Review item not found.", 404);
  return record;
}
// Single-item helpers for other channels (approvals bot). `by` is shown in the history.
export async function approveReviewItem(itemId: string, by: string) {
  const record = await recordOfItem(itemId);
  await setApproval(record.id, [itemId], true, by);
  return (await listApprovalItems({ status: "all", siteId: record.siteId })).find((i) => i.id === itemId)!;
}
// AI rewrites the block following the instruction; returns the new texts (pending again).
export async function reviseReviewItem(itemId: string, instruction: string, by: string) {
  const record = await recordOfItem(itemId);
  await requestChange(record.id, itemId, instruction, by);
  const after = await readRecord(record.id);
  const last = after.ai.log.at(-1);
  const item = (await listApprovalItems({ status: "all", siteId: record.siteId })).find((i) => i.id === itemId)!;
  return { item, cost: last?.cost ?? 0, model: last?.model ?? "" };
}
