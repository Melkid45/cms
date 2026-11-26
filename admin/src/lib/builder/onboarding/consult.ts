import "server-only";
import { z } from "zod";
import { StoreError } from "../server";
import { aiEnabled } from "../ai";
import { readRegistry } from "../sites";
import {
  type Brief,
  type BriefOffer,
  guessNiche,
  LANGUAGE_OPTIONS,
  languagesFromAnswer,
  NICHES,
  type Niche,
  nicheFromLabel,
  type Onboarding,
  type OnboardingView,
  PAGE_TYPES,
  pagesFromAnswer,
  TOPICS,
} from "./shared";
import { changeRecord, logEvent, newId, parseJson, readRecord, recordAi } from "./store";
import { readOldSite } from "./fetch-site";
import { type ConsultLang, foundLabel, message, optionLabel, questionText } from "./i18n";
import { LANGUAGE_NAMES } from "./generate";

export const langOf = (record: Pick<Onboarding, "lang">): ConsultLang => record.lang ?? "en";

export function currentNiche(record: Pick<Onboarding, "answers" | "suggested" | "brief">): Niche | undefined {
  return (
    record.brief?.niche ??
    nicheFromLabel(record.answers.niche || "") ??
    guessNiche(`${record.answers.business || ""} ${record.suggested.business || ""}`)
  );
}
// Next question: the script in order (skipped topics are stored as ""), then AI follow-ups.
export function nextQuestion(record: Onboarding): OnboardingView["question"] {
  if (record.briefConfirmed) return null;
  const niche = currentNiche(record);
  for (const topic of TOPICS) {
    if (record.answers[topic.id] !== undefined) continue;
    const lang = langOf(record);
    const asked = topic.ask({ answers: record.answers, niche, lang });
    if (!asked) continue;
    return {
      topic: topic.id,
      kind: topic.kind,
      ...asked,
      optionLabels: asked.options?.map((o) => optionLabel(lang, o)),
      optional: topic.optional,
      suggestion: record.suggested[topic.id] || undefined,
    };
  }
  const follow = record.followUps.find((f) => record.answers[f.id] === undefined);
  if (follow)
    return { topic: follow.id, kind: "textarea", text: follow.text, optional: true, hint: questionText(langOf(record), "follow").hint };
  return null;
}
export async function viewOf(record: Onboarding): Promise<OnboardingView> {
  const site = (await readRegistry()).sites.find((s) => s.id === record.siteId);
  const { tokenHash, ...rest } = record;
  void tokenHash;
  return {
    ...rest,
    siteKey: site?.key ?? "",
    siteName: site?.name ?? record.business,
    question: nextQuestion(record),
    aiEnabled: record.mock || aiEnabled(),
  };
}
const say = (record: Onboarding, role: "assistant" | "customer", text: string, topic?: string, via?: "voice" | "text") => {
  record.messages.push({ id: newId(), role, text: text.slice(0, 5000), topic, via, at: new Date().toISOString() });
  if (record.messages.length > 300) record.messages = record.messages.slice(-300);
};

// ---- Answers ----
export async function answer(id: string, input: { topic: string; text: string; via?: "voice" | "text" }, by: string) {
  const record = await changeRecord(id, (record) => {
    if (record.briefConfirmed) throw new StoreError("The brief is already confirmed.", 409);
    const question = nextQuestion(record);
    const known = TOPICS.some((t) => t.id === input.topic) || record.followUps.some((f) => f.id === input.topic);
    if (!known) throw new StoreError("Unknown question.");
    const text = input.text.trim();
    const topic = TOPICS.find((t) => t.id === input.topic);
    if (!text && topic && !topic.optional) throw new StoreError("Please answer this question.");
    if (question?.topic === input.topic) say(record, "assistant", question.text, input.topic);
    // Choices are stored as their English values and shown in the consultation language.
    const shown =
      question?.topic === input.topic && question.options
        ? text
            .split(", ")
            .map((part) => optionLabel(langOf(record), part))
            .join(", ")
        : text;
    say(record, "customer", shown || message(langOf(record), "skipped"), input.topic, input.via);
    record.answers[input.topic] = text;
    if (input.topic === "business" && !record.business) record.business = text.split(/[—\-–,.\n]/)[0].trim().slice(0, 100);
    // Changing answers after the brief was written makes the brief stale.
    if (record.brief) record.brief = undefined;
    logEvent(record, `Answered: ${input.topic}`, by);
    return record;
  });
  // After the last scripted question, AI writes up to 3 follow-ups for gaps (once).
  if (!nextQuestion(record) && !record.followUpsAsked && (record.mock || aiEnabled())) await writeFollowUps(id).catch(() => undefined);
  return readRecord(id);
}
const answersText = (record: Onboarding) =>
  [
    ...TOPICS.map((t) => [t.id, record.answers[t.id]] as const),
    ...record.followUps.map((f) => [f.text, record.answers[f.id]] as const),
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
async function writeFollowUps(id: string) {
  const record = await readRecord(id);
  const result = await recordAi(id, "follow-up questions", {
    system: `You help a small-business owner brief a website. Given their answers, find up to 3 important gaps for building the website (missing prices, missing opening hours, unclear main service, missing years in business or proof). Ask short, friendly questions in ${LANGUAGE_NAMES[langOf(record)]}. If nothing important is missing, return an empty list. Answer JSON: {"questions": ["..."]}`,
    user: answersText(record),
    maxTokens: 400,
    json: true,
    mock: () =>
      JSON.stringify({
        questions: [
          { en: "Mock follow-up: how many years have you been in business?", lv: "Mock papildjautājums: cik gadus strādājat?", ru: "Mock уточнение: сколько лет вы работаете?" }[langOf(record)],
        ],
      }),
  });
  const parsed = parseJson<{ questions?: unknown }>(result.text);
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 3).slice(0, 3)
    : [];
  await changeRecord(id, (record) => {
    record.followUpsAsked = true;
    record.followUps = questions.map((text, n) => ({ id: `follow-${n + 1}`, text: text.trim().slice(0, 400) }));
  });
}

// ---- Old website ----
export async function importSite(id: string, url: string, by: string) {
  const site = await readOldSite(url);
  const pageText = site.pages
    .map((p) => `URL: ${p.url}\nTitle: ${p.title}\nDescription: ${p.description}\nText: ${p.text}`)
    .join("\n\n")
    .slice(0, 12000);
  const all = site.pages.map((p) => p.text).join(" ");
  const result = await recordAi(id, "read old website", {
    system:
      "You read the text of a small business's existing website and extract facts for a new website brief. Use only facts present in the text; never invent. Keep the website's language. Answer JSON with string fields (empty string if not found): {\"business\": name and one-sentence description, \"offer\": services or products one per line, with prices exactly as written, \"audience\": who the customers are, \"unique\": real differentiators (years, awards, guarantees), \"contacts\": phone, e-mail, address and social links one per line, \"hours\": opening hours, \"colors\": \"\"}",
    user: pageText,
    maxTokens: 1200,
    json: true,
    mock: () =>
      JSON.stringify({
        business: [site.pages[0]?.title, site.pages[0]?.description].filter(Boolean).join(" — "),
        offer: "",
        audience: "",
        unique: "",
        contacts: [
          ...(all.match(/\+?\d[\d ()-]{7,}\d/g) || []).slice(0, 1),
          ...(all.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).slice(0, 1),
        ].join("\n"),
        hours: "",
        colors: "",
      }),
  });
  const found = parseJson<Record<string, unknown>>(result.text);
  return changeRecord(id, (record) => {
    record.imported = {
      url: site.url,
      at: new Date().toISOString(),
      pages: site.pages.map((p) => ({ url: p.url, title: p.title })),
      images: site.images,
    };
    const keys = ["business", "offer", "audience", "unique", "contacts", "hours", "colors"];
    const filled: string[] = [];
    for (const key of keys) {
      const value = typeof found[key] === "string" ? (found[key] as string).trim() : "";
      if (value) {
        record.suggested[key] = value.slice(0, 3000);
        filled.push(key);
      }
    }
    if (record.answers.source === undefined) {
      say(record, "assistant", questionText(langOf(record), "source").text, "source");
      say(record, "customer", site.url, "source");
      record.answers.source = site.url;
    }
    say(
      record,
      "assistant",
      filled.length
        ? message(langOf(record), "import.found", {
            pages: site.pages.length,
            host: new URL(site.url).hostname,
            found: [...filled, ...(site.images.length ? ["images"] : [])].map((k) => foundLabel(langOf(record), k)).join(", "),
          })
        : message(langOf(record), "import.little", { host: new URL(site.url).hostname }),
    );
    logEvent(record, `Old website read: ${site.url}`, by);
    return record;
  });
}

// ---- Brief ----
export function parseOffers(text = ""): BriefOffer[] {
  let category = "";
  const offers: BriefOffer[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^[-*•]\s*/, "");
    if (!line) continue;
    if (/:$/.test(line)) {
      category = line.slice(0, -1).trim();
      continue;
    }
    const parts = line.split(/\s+[—–|-]\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    const priceIndex = parts.findIndex((p) => /\d/.test(p) && /€|eur|\$|£|^\d+([.,]\d+)?$|from|no /i.test(p));
    const price = priceIndex > 0 ? parts[priceIndex] : "";
    const rest = parts.filter((_, i) => i !== priceIndex);
    offers.push({ name: rest[0] || line, price, description: rest.slice(1).join(" — "), category });
  }
  return offers.slice(0, 60);
}
const contactLine = (text: string, pattern: RegExp) => text.match(pattern)?.[0]?.trim() ?? "";
// Deterministic brief from the answers (mock mode and fallback values for the AI brief).
export function scriptedBrief(record: Onboarding): Brief {
  const a = record.answers;
  const niche = currentNiche(record) ?? "services";
  const contacts = a.contacts || "";
  const languages = languagesFromAnswer(a.languages);
  const unknowns: string[] = [];
  const offers = parseOffers(a.offer);
  if (offers.some((o) => !o.price)) unknowns.push("Prices for some items");
  if (!a.hours && NICHES[niche].booking) unknowns.push("Opening hours");
  return {
    business: record.business || a.business?.slice(0, 100) || "",
    niche,
    summary: a.business || "",
    audience: a.audience || "",
    offers,
    unique: (a.unique || "").split("\n").map((s) => s.trim()).filter(Boolean),
    tone: a.tone || "",
    colors: a.colors || "",
    accent: contactLine(a.colors || "", /#[0-9a-f]{6}\b/i),
    competitors: a.competitors || "",
    phone: contactLine(contacts, /\+?\d[\d ()-]{6,}\d/),
    email: contactLine(contacts, /[\w.+-]+@[\w-]+\.[\w.]+/),
    address: contacts
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !/@|https?:|^\+?\d[\d ()-]{6,}\d$/.test(l)) || "",
    hours: a.hours || "",
    social: (contacts.match(/https?:\/\/\S+/g) || []).slice(0, 6),
    languages: languages.length ? languages : ["en"],
    goal: a.goal || "",
    pages: pagesFromAnswer(a.pages, niche),
    unknowns,
  };
}
const pageTypes = PAGE_TYPES.map((p) => p.id) as [string, ...string[]];
const localeIds = LANGUAGE_OPTIONS.map((l) => l.id) as [string, ...string[]];
const s = (max: number) => z.string().trim().max(max).catch("");
export const briefSchema = z.object({
  business: z.string().trim().min(1).max(120),
  niche: z.enum(Object.keys(NICHES) as [Niche, ...Niche[]]),
  summary: s(2000),
  audience: s(1500),
  offers: z
    .array(z.object({ name: z.string().trim().min(1).max(200), price: s(60), description: s(500), category: s(100) }))
    .max(60),
  unique: z.array(z.string().trim().min(1).max(300)).max(12),
  tone: s(200),
  colors: s(500),
  accent: z.string().regex(/^(#[0-9a-fA-F]{6})?$/).catch(""),
  competitors: s(1500),
  phone: s(60),
  email: s(200),
  address: s(300),
  hours: s(500),
  social: z.array(z.string().trim().regex(/^https:\/\/\S+$/).max(300)).max(8).catch([]),
  languages: z.array(z.enum(localeIds)).min(1).max(4),
  goal: s(200),
  pages: z.array(z.enum(pageTypes)).min(1).max(8),
  unknowns: z.array(z.string().trim().min(1).max(200)).max(20).catch([]),
});
export async function writeBrief(id: string, by: string) {
  const record = await readRecord(id);
  if (nextQuestion(record)) throw new StoreError("Please answer the remaining questions first.");
  const base = scriptedBrief(record);
  const result = await recordAi(id, "brief", {
    system: `You turn a small-business owner's answers into a structured website brief. Use ONLY facts from the answers; never invent prices, years, awards, names or numbers. Unknown facts go to "unknowns". Write in the owner's main language (${base.languages[0]}). Answer JSON with exactly these keys: business (name), niche (one of ${Object.keys(NICHES).join(", ")}), summary (2-3 sentences about the business), audience, offers (array of {name, price (exactly as given or ""), description (only from the answers or ""), category}), unique (array of real differentiators), tone, colors, accent (one #rrggbb matching the client's colours, or ""), competitors, phone, email, address, hours, social (array of https links), languages (codes from lv, ru, en, de; main first), goal, pages (from ${pageTypes.join(", ")}; home first), unknowns (array).`,
    user: `${answersText(record)}\n\nDetected so far (fix if wrong): ${JSON.stringify({ niche: base.niche, languages: base.languages, pages: base.pages, phone: base.phone, email: base.email })}`,
    maxTokens: 2500,
    json: true,
    mock: () => JSON.stringify(base),
  });
  const raw = parseJson<Record<string, unknown>>(result.text);
  const merged = { ...base, ...raw };
  const parsed = briefSchema.safeParse(merged);
  const brief = (parsed.success ? parsed.data : base) as Brief;
  // The client chose the pages and languages themselves: keep them.
  brief.pages = base.pages;
  if (languagesFromAnswer(record.answers.languages).length) brief.languages = base.languages;
  if (!brief.pages.includes("home")) brief.pages.unshift("home");
  return changeRecord(id, (record) => {
    record.brief = brief;
    say(record, "assistant", message(langOf(record), "brief.ready"));
    logEvent(record, "Brief written", by);
    return record;
  });
}
export async function saveBrief(id: string, input: unknown, by: string) {
  const parsed = briefSchema.safeParse(input);
  if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message || "Check the brief.");
  return changeRecord(id, (record) => {
    if (record.briefConfirmed && record.step !== "draft")
      throw new StoreError("The website is already built from this brief.", 409);
    record.brief = { ...(parsed.data as Brief), pages: parsed.data.pages.includes("home") ? (parsed.data.pages as Brief["pages"]) : (["home", ...parsed.data.pages] as Brief["pages"]) };
    logEvent(record, "Brief edited", by);
    return record;
  });
}
export async function confirmBrief(id: string, by: string) {
  return changeRecord(id, (record) => {
    if (!record.brief) throw new StoreError("Write the brief first.");
    if (record.step !== "consultation") throw new StoreError("The brief is already confirmed.", 409);
    record.briefConfirmed = true;
    record.step = "draft";
    say(record, "assistant", message(langOf(record), "brief.confirmed"));
    logEvent(record, "Brief confirmed", by);
    return record;
  });
}
// The client (or the team) picks the consultation language; questions asked from now on
// and the assistant's messages use it.
export async function setLang(id: string, lang: ConsultLang, by: string) {
  return changeRecord(id, (record) => {
    if (record.step !== "consultation") throw new StoreError("The consultation is finished.", 409);
    record.lang = lang;
    logEvent(record, `Consultation language: ${lang}`, by);
    return record;
  });
}
