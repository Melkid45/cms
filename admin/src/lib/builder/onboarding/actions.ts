import "server-only";
import { z } from "zod";
import { StoreError } from "../server";
import { aiTranscribe, aiEnabled } from "../ai";
import { createCompany, createSite } from "../sites";
import { notifyTeam } from "../notifications";
import type { Onboarding } from "./shared";
import { type Actor, changeRecord, logAi, logEvent, newId, newToken, onboardingStore, readRecord } from "./store";
import { answer, confirmBrief, importSite, saveBrief, setLang, viewOf, writeBrief } from "./consult";
import { CONSULT_LANGS, type ConsultLang, isConsultLang } from "./i18n";
import { languagesFromAnswer } from "./shared";
import { buildDraft } from "./generate";
import { requestChange, setApproval, undoRevision } from "./review";
import { publishSite, translateSite } from "./translate";

export async function createOnboarding(input: {
  siteId: string;
  companyId: string;
  business: string;
  orderId?: string;
  mock?: boolean;
  test?: boolean;
  lang?: ConsultLang;
}) {
  const { token, tokenHash } = newToken();
  const now = new Date().toISOString();
  const record: Onboarding = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    siteId: input.siteId,
    companyId: input.companyId,
    orderId: input.orderId,
    tokenHash,
    mock: !!input.mock,
    test: !!input.test,
    lang: input.lang,
    step: "consultation",
    business: input.business.slice(0, 100),
    messages: [],
    answers: {},
    suggested: {},
    followUps: [],
    followUpsAsked: false,
    photos: [],
    briefConfirmed: false,
    pages: [],
    review: [],
    translations: [],
    ai: { calls: 0, cost: 0, log: [] },
    events: [{ at: now, text: "Onboarding started", by: "system" }],
  };
  await onboardingStore((data) => {
    if (data.items.length >= 2000) throw new StoreError("Too many onboarding records.", 503);
    data.items.unshift(record);
  });
  return { record, token };
}
// Super admin: a new company + website (blank sample site) + onboarding, e.g. for a client
// met in person or a test ("Onboarding TEST", mock AI).
export const startInput = z
  .object({ business: z.string().trim().min(2).max(100), mock: z.boolean().default(false), test: z.boolean().default(false) })
  .strict();
export async function startForNewCompany(input: z.infer<typeof startInput>) {
  const company = await createCompany({ name: input.business });
  const site = await createSite({ companyId: company.id, name: input.business });
  return createOnboarding({ siteId: site.id, companyId: company.id, business: input.business, mock: input.mock, test: input.test });
}
// Website order confirmed (/api/orders/[id]/confirm): the client continues with the consultation.
export async function startForOrder(order: {
  id: string;
  siteId: string;
  companyId: string;
  business: string;
  answers?: Record<string, string>;
}) {
  const existing = await onboardingStore((data) => data.items.find((r) => r.orderId === order.id), false);
  if (existing) return existing;
  const { answers, ...rest } = order;
  // Consultation language: the first website language the client chose in the order (LV/RU/EN).
  const first = languagesFromAnswer(answers?.languages)[0];
  const { record } = await createOnboarding({ ...rest, orderId: order.id, lang: isConsultLang(first) ? first : undefined });
  // The order interview already asked a few things: offered as answers to confirm.
  const suggested = {
    business: [answers?.business, answers?.about].filter(Boolean).join(" — "),
    offer: answers?.offer ?? "",
  };
  await changeRecord(record.id, (r) => {
    for (const [key, value] of Object.entries(suggested)) if (value.trim()) r.suggested[key] = value.slice(0, 3000);
  });
  return record;
}
export const onboardingForOrder = (orderId: string) =>
  onboardingStore((data) => data.items.find((r) => r.orderId === orderId)?.id ?? null, false);

const text = (max: number) => z.string().max(max);
export const onboardingAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), topic: z.string().max(40), text: text(5000), via: z.enum(["voice", "text"]).optional() }).strict(),
  z.object({ action: z.literal("lang"), lang: z.enum(CONSULT_LANGS) }).strict(),
  z.object({ action: z.literal("import"), url: z.string().trim().min(4).max(500) }).strict(),
  z.object({ action: z.literal("brief") }).strict(),
  z.object({ action: z.literal("save-brief"), brief: z.unknown() }).strict(),
  z.object({ action: z.literal("confirm-brief") }).strict(),
  z.object({ action: z.literal("build") }).strict(),
  z.object({ action: z.literal("comment"), item: z.string().max(100), text: text(2000), via: z.enum(["voice", "text"]).optional() }).strict(),
  z.object({ action: z.literal("undo"), item: z.string().max(100) }).strict(),
  z.object({ action: z.literal("approve"), items: z.array(z.string().max(100)).min(1).max(300), approved: z.boolean() }).strict(),
  z.object({ action: z.literal("translate"), locales: z.array(z.enum(["lv", "ru", "en", "de"])).min(1).max(3) }).strict(),
  z.object({ action: z.literal("publish") }).strict(),
  // Team only:
  z.object({ action: z.literal("new-link") }).strict(),
  z.object({ action: z.literal("photo-remove"), url: z.string().max(500) }).strict(),
]);
// Unexpected failures are written to the record history for the team (the client only sees
// a generic message).
export async function runAction(id: string, input: z.infer<typeof onboardingAction>, actor: Actor) {
  try {
    return await runActionInner(id, input, actor);
  } catch (error) {
    if (!(error instanceof StoreError))
      await changeRecord(id, (record) =>
        logEvent(record, `Error in ${input.action}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500), "system"),
      ).catch(() => undefined);
    throw error;
  }
}
async function runActionInner(id: string, input: z.infer<typeof onboardingAction>, actor: Actor) {
  const by = actor.kind === "customer" ? "client" : actor.name;
  let token: string | undefined;
  switch (input.action) {
    case "answer":
      await answer(id, input, by);
      break;
    case "lang":
      await setLang(id, input.lang, by);
      break;
    case "import":
      await importSite(id, input.url, by);
      break;
    case "brief":
      await writeBrief(id, by);
      break;
    case "save-brief":
      await saveBrief(id, input.brief, by);
      break;
    case "confirm-brief": {
      const record = await confirmBrief(id, by);
      await notifyTeam({
        kind: "order-action",
        title: `${record.business}: brief confirmed`,
        text: "The client finished the consultation; the draft website is being built.",
        href: `/dashboard/onboarding/${id}`,
      }).catch(() => undefined);
      await buildDraft(id, by);
      break;
    }
    case "build":
      await buildDraft(id, by);
      break;
    case "comment":
      await requestChange(id, input.item, input.text, by);
      break;
    case "undo":
      await undoRevision(id, input.item, by);
      break;
    case "approve":
      await setApproval(id, input.items, input.approved, by);
      break;
    case "translate":
      await translateSite(id, input.locales, by);
      break;
    case "publish": {
      const record = await readRecord(id);
      if (actor.kind === "customer" && record.test) throw new StoreError("This is a test website; the team publishes it.", 403);
      await publishSite(id, by);
      break;
    }
    case "new-link": {
      if (actor.kind !== "team" || actor.identity.role !== "super-admin")
        throw new StoreError("Only the super admin can do this.", 403);
      const next = newToken();
      token = next.token;
      await changeRecord(id, (record) => {
        record.tokenHash = next.tokenHash;
      });
      break;
    }
    case "photo-remove":
      await changeRecord(id, (record) => {
        record.photos = record.photos.filter((p) => p !== input.url);
      });
      break;
  }
  return { view: await viewOf(await readRecord(id)), token };
}

// Voice: 16 kHz mono WAV from the browser (max ~2 min) → text the client can edit before sending.
export async function transcribe(id: string, audio: Buffer, language?: string) {
  const record = await readRecord(id);
  if (!record.mock && !aiEnabled()) throw new StoreError("Voice answers need AI, which is switched off on this server.", 503);
  if (audio.length < 1000 || audio.subarray(0, 4).toString("ascii") !== "RIFF" || audio.subarray(8, 12).toString("ascii") !== "WAVE")
    throw new StoreError("Send a WAV recording.");
  const seconds = Math.round(audio.length / 32000);
  const result = await aiTranscribe({
    audio,
    format: "wav",
    language,
    useMock: record.mock,
    mock: `Mock transcript of a ${seconds}-second voice message.`,
  });
  await logAi(id, "voice transcript", result);
  return result.text;
}
