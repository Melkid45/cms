import "server-only";
import { createHash } from "node:crypto";
import { withDoc } from "../doc-store";
import { readProject, writeProject, StoreError } from "../server";
import { aiComplete, aiStatus } from "../ai";
import { definition, createSection } from "../catalog";
import { collectionItems } from "../collections";
import { pageHref, siteLanguages, translationsOf } from "../i18n";
import { pageSnapshot } from "../workflows";
import type { Role } from "../access";
import type { CmsPage, Project, Section } from "../types";
import { auditSite, aiChecks, LIMITS, type PageAudit } from "./audit";
import { pageContent } from "./content";
import { pageSlots, readTarget, writeTarget, type TextSlot } from "./fields";
import { seoPack } from "./pack";
import { afterPublish } from "./publish";
import {
  FAQ_HEADING,
  PROMPT_VERSION,
  SEE_ALSO,
  SINCE,
  revisePrompt,
  systemPrompt,
  userPrompt,
  type PageTask,
} from "./assistant-prompts";
import {
  DEFAULT_SETTINGS,
  SUGGESTION_TYPES,
  type AssistantRun,
  type AssistantSettings,
  type ChangeTarget,
  type MonthlyReport,
  type Suggestion,
  type SuggestionChange,
} from "./assistant-shared";

// AI SEO assistant (SEO pack). BUILDER.md → "AI SEO assistant".
// Proposes improvements for published pages (rules + one batched AI call per few pages),
// keeps them in a per-website approval queue, applies approved ones to the draft (optionally
// publishing only that change), keeps history with undo, and builds a monthly report.
// Nothing changes on a page without an approval. Paid AI only through lib/builder/ai.ts.

interface AssistantDoc {
  settings: AssistantSettings;
  suggestions: Suggestion[];
  runs: AssistantRun[];
  cache: Record<string, string>; // pageId → hash of what the AI last saw
  months: Record<string, { cost: number; calls: number }>;
  scores: Record<string, number>; // website audit score at the first run of a month
  reports: Record<string, { sentAt?: string; result?: string }>;
  lastMonthly?: string;
}
const docId = (siteId: string) => `seo-assistant:${siteId}`;
const empty = (): AssistantDoc => ({
  settings: { ...DEFAULT_SETTINGS },
  suggestions: [],
  runs: [],
  cache: {},
  months: {},
  scores: {},
  reports: {},
});
function store<T>(siteId: string, fn: (doc: AssistantDoc) => T | Promise<T>, write = true) {
  return withDoc<AssistantDoc, T>(
    docId(siteId),
    empty,
    (doc) => {
      doc.settings = { ...DEFAULT_SETTINGS, ...doc.settings };
      doc.suggestions ??= [];
      doc.runs ??= [];
      doc.cache ??= {};
      doc.months ??= {};
      doc.scores ??= {};
      doc.reports ??= {};
      return fn(doc);
    },
    write,
  );
}
const month = (date = new Date()) => date.toISOString().slice(0, 7);
const newId = () => crypto.randomUUID();
const one = (value: string) => value.replace(/\s+/g, " ").trim();
const clip = (value: string, n: number) => (value.length > n ? value.slice(0, n - 1) + "…" : value);
const average = (audits: PageAudit[]) =>
  audits.length ? Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length) : 0;

export async function readAssistant(siteId: string) {
  return store(siteId, (doc) => doc, false);
}
export async function updateSettings(siteId: string, patch: Partial<AssistantSettings>) {
  return store(siteId, (doc) => {
    doc.settings = { ...doc.settings, ...patch };
    doc.settings.budgetUsd = Math.min(Math.max(doc.settings.budgetUsd, 0), 20);
    doc.settings.maxPages = Math.min(Math.max(Math.round(doc.settings.maxPages), 1), 60);
    return doc.settings;
  });
}

// ------------------------------------------------------------------ facts on the website
const NUMBER = /\d[\d\s.,]*\d|\d/g;
const numberKey = (value: string) => value.replace(/[\s.,]/g, "").replace(/^0+(?=\d)/, "");
const numbersIn = (text: string) => (text.match(NUMBER) ?? []).map(numberKey).filter(Boolean);
const PROMISE = /garant|гарант|guarant|warrant|garantie|bezmaksas|бесплатн|free of charge|kostenlos|labākais|лучш|the best|cheapest|lētākais|дешевл/i;
function businessFacts(project: Project) {
  const b = project.seo?.business;
  return [
    `Name: ${b?.name || project.brand.name}`,
    b?.street || project.website?.address ? `Address: ${[b?.street || project.website?.address, b?.city, b?.postalCode].filter(Boolean).join(", ")}` : "",
    b?.phone || project.website?.phone ? `Phone: ${b?.phone || project.website?.phone}` : "",
    b?.email || project.website?.contactEmail ? `E-mail: ${b?.email || project.website?.contactEmail}` : "",
    b?.hours ? `Opening hours: ${b.hours.split("\n").map(one).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
// Everything the website says (published pages, SEO texts, business facts): new texts may use
// only numbers / promises found here.
function siteCorpus(project: Project) {
  const parts = [businessFacts(project), project.brand.name];
  for (const page of project.pages.filter((p) => !p.deletedAt && p.published)) {
    const snap = page.published!;
    parts.push(snap.title, snap.seo.title, snap.seo.description, ...pageContent(snap.sections).outline);
    for (const slot of pageSlots(snap.sections)) if (slot.kind === "alt" || slot.kind === "link") parts.push(slot.value);
  }
  const text = parts.join("\n");
  return { text: text.toLowerCase(), numbers: new Set(numbersIn(text)) };
}
type Corpus = ReturnType<typeof siteCorpus>;
function factFlags(value: string, corpus: Corpus, pageText: string) {
  const flags: string[] = [];
  const unknown = [...new Set(numbersIn(value))].filter((n) => !corpus.numbers.has(n));
  if (unknown.length) flags.push(`Number${unknown.length > 1 ? "s" : ""} not found on the website: ${unknown.slice(0, 4).join(", ")}`);
  const promise = value.match(PROMISE)?.[0];
  if (promise && !pageText.toLowerCase().includes(promise.toLowerCase()) && !corpus.text.includes(promise.toLowerCase()))
    flags.push(`Promise/claim "${promise}…" is not on the website`);
  return flags;
}
const LV_DIACRITICS = /[āčēģīķļņšūž]/i;
function languageFlags(value: string, locale: string) {
  if (locale === "lv" && value.length > 40 && !LV_DIACRITICS.test(value)) return ["Latvian text without diacritics: check spelling"];
  if (locale === "ru" && value.length > 20 && !/[а-яё]/i.test(value)) return ["Not in Russian"];
  if ((locale === "lv" || locale === "en" || locale === "de") && /[а-яё]{3}/i.test(value)) return ["Contains Cyrillic text"];
  return [];
}
const scriptOf = (value: string) => {
  const cyr = (value.match(/[а-яё]/gi) ?? []).length;
  const lat = (value.match(/[a-zāčēģīķļņšūž]/gi) ?? []).length;
  return cyr > lat ? "cyr" : "lat";
};

// ------------------------------------------------------------------ helpers on pages
const stems = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 3)
      .map((w) => w.slice(0, 5)),
  );
function faqSectionOf(sections: Section[]) {
  for (const section of sections.filter((s) => !s.hidden)) {
    const entry = definition(section.variant);
    if (entry?.family === "faq" && entry.repeaters?.length) return { section, entry, group: entry.repeaters[0] };
  }
}
function faqKeys(variant: string, template: number) {
  const entry = definition(variant);
  const group = entry?.repeaters?.[0];
  const fields = group?.items[template]?.fields ?? [];
  const type = (key: string) => entry?.fields.find((f) => f.key === key)?.type;
  return {
    q: fields.find((k) => type(k) === "heading") ?? fields[0],
    a: fields.find((k) => type(k) === "textarea" || type(k) === "text") ?? fields[1],
  };
}
const faqText = (items: { q: string; a: string }[]) => items.map((i) => `${i.q}\n${i.a}`).join("\n\n");
const parseFaq = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((block) => {
      const [q, ...rest] = block.trim().split("\n");
      return { q: one(q || ""), a: one(rest.join(" ")) };
    })
    .filter((i) => i.q && i.a);
function faqTarget(project: Project, page: Pick<CmsPage, "sections" | "locale">, items: { q: string; a: string }[]): { target: ChangeTarget; structural: boolean } {
  const found = faqSectionOf(page.sections);
  if (found) {
    const template = found.group.items.length > 1 ? 1 : 0;
    const keys = faqKeys(found.section.variant, template);
    return {
      structural: false,
      target: {
        kind: "faq-add",
        sectionId: found.section.id,
        collection: found.group.id,
        items: items.map((i) => ({ template, values: { [keys.q]: i.q, [keys.a]: i.a } })),
      },
    };
  }
  // No FAQ block on the page: a new one, in the FAQ variant the website already uses.
  const used = project.pages.flatMap((p) => p.sections).find((s) => definition(s.variant)?.family === "faq")?.variant;
  const variant = used && definition(used)?.repeaters?.length ? used : "faq-v1";
  const entry = definition(variant)!;
  const group = entry.repeaters![0];
  const inItems = new Set(group.items.flatMap((i) => i.fields));
  const values = Object.fromEntries(entry.fields.filter((f) => !inItems.has(f.key)).map((f) => [f.key, ""]));
  const heading = entry.fields.find((f) => !inItems.has(f.key) && f.type === "heading");
  if (heading) values[heading.key] = FAQ_HEADING[page.locale] || FAQ_HEADING.en;
  const visible = page.sections.filter((s) => !s.hidden);
  const before = visible.find((s, i) => i > 0 && ["contact", "cta"].includes(definition(s.variant)?.family || ""));
  return {
    structural: true,
    target: {
      kind: "section-add",
      variant,
      values,
      collection: group.id,
      items: items.map((i, n) => {
        const template = n === 0 || group.items.length < 2 ? 0 : 1;
        const keys = faqKeys(variant, template);
        return { template, values: { [keys.q]: i.q, [keys.a]: i.a } };
      }),
      beforeSectionId: before?.id,
    },
  };
}

// ------------------------------------------------------------------ mock answers (test mode)
function mockAnswer(tasks: PageTask[]) {
  return JSON.stringify({
    pages: tasks.map((t) => {
      const lines = t.text.split("\n").filter(Boolean);
      const heading = (lines.find((l) => l.startsWith("#")) || t.title).replace(/^#+\s*/, "");
      const para = lines.find((l) => !l.startsWith("#")) || t.title;
      return {
        id: t.id,
        title: t.meta?.title ? clip(`${heading} | ${t.brand}`, 60) : undefined,
        description: t.meta?.description ? clip(one(lines.filter((l) => !l.startsWith("#")).join(" ")) || para, 155) : undefined,
        alts: t.alts?.map((a) => ({ ref: a.ref, alt: clip(a.context.split(" · ")[0] || t.title, 100) })),
        faq: t.faq
          ? lines
              .filter((l) => l.startsWith("##"))
              .slice(0, t.faq.count)
              .map((l) => ({ q: `${l.replace(/^#+\s*/, "").replace(/[.?!]$/, "")}?`, a: clip(para, 200) }))
          : undefined,
        headings: t.headings?.slice(0, 1).map((h) => ({ ref: h.ref, text: `${h.text.replace(/[.?!]$/, "")}?` })),
        h1: t.h1 ? { ref: t.h1.ref, text: clip(t.title, 70) } : undefined,
        lead: t.lead ? { ref: t.lead.ref, text: clip(para.split(/(?<=[.!?])\s/)[0], 200) } : undefined,
        translations: t.translate?.map((x) => ({ ref: x.ref, text: `[${t.locale}] ${x.text}` })),
      };
    }),
  });
}
function parseJson(text: string): unknown {
  const body = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{"),
      end = body.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error("Not JSON");
  }
}
type AiPage = {
  id?: string;
  title?: string;
  description?: string;
  alts?: { ref?: string; alt?: string }[];
  faq?: { q?: string; a?: string }[];
  headings?: { ref?: string; text?: string }[];
  h1?: { ref?: string; text?: string };
  lead?: { ref?: string; text?: string };
  translations?: { ref?: string; text?: string }[];
  notes?: string[];
};

// The answer should be {"pages":[…]}; models sometimes return a bare list, pages keyed by id
// or a single page object.
function answerPages(value: unknown): AiPage[] {
  const withId = (entries: [string, unknown][]) =>
    entries.filter(([, v]) => v && typeof v === "object").map(([id, v]) => ({ id, ...(v as object) }) as AiPage);
  if (Array.isArray(value)) return value as AiPage[];
  if (!value || typeof value !== "object") return [];
  const o = value as Record<string, unknown>;
  if (Array.isArray(o.pages)) return o.pages as AiPage[];
  if (o.pages && typeof o.pages === "object") return withId(Object.entries(o.pages));
  const keyed = Object.entries(o).filter(([k]) => /^p\d+$/i.test(k));
  if (keyed.length) return withId(keyed);
  return ["title", "description", "alts", "faq", "headings", "h1", "lead", "translations"].some((k) => k in o) ? [{ id: "p1", ...o } as AiPage] : [];
}

// ------------------------------------------------------------------ the run
interface PageWork {
  page: CmsPage;
  snap: CmsPage["published"] & object;
  audit: PageAudit;
  slots: TextSlot[];
  task: PageTask;
  hash: string;
  wantsAi: boolean;
}
export async function runAssistant(
  siteId: string,
  siteKey: string,
  options: { by: string; trigger: "manual" | "monthly"; mock?: boolean; maxPages?: number; pageIds?: string[] },
) {
  if (!(await seoPack(siteId))) throw new StoreError("The AI SEO assistant is part of the SEO pack.", 402);
  const project = await readProject(siteId);
  const state = await readAssistant(siteId);
  const settings = state.settings;
  const mock = !!(options.mock || settings.testMode);
  const audits = auditSite(project, siteKey);
  const auditOf = new Map(audits.map((a) => [a.pageId, a]));
  const corpus = siteCorpus(project);
  const facts = businessFacts(project);
  const languages = siteLanguages(project);
  const now = new Date().toISOString();
  const runId = newId();
  const created: Suggestion[] = [];
  const run: AssistantRun = {
    id: runId,
    at: now,
    by: options.by,
    trigger: options.trigger,
    mock,
    pages: 0,
    aiPages: 0,
    cachedPages: 0,
    calls: 0,
    cost: 0,
    tokensIn: 0,
    tokensOut: 0,
    suggestions: 0,
  };
  const make = (work: { page: CmsPage; snap: { title: string; locale: string } }, s: Omit<Suggestion, "id" | "runId" | "createdAt" | "pageId" | "pageTitle" | "pageSlug" | "locale" | "status">): Suggestion => {
    const flags = [...new Set(s.flags)];
    return {
      ...s,
      flags,
      risk: flags.some((f) => !f.startsWith("Test mode:")) && s.risk === "low" ? "medium" : s.risk,
      id: newId(),
      runId,
      createdAt: now,
      pageId: work.page.id,
      pageTitle: work.snap.title,
      pageSlug: work.page.slug,
      locale: work.snap.locale,
      status: "pending",
    };
  };

  const candidates = project.pages
    .filter((p) => !p.deletedAt && p.published && !p.published.seo.noindex)
    .filter((p) => !options.pageIds?.length || options.pageIds.includes(p.id))
    .sort((a, b) => (auditOf.get(a.id)?.score ?? 100) - (auditOf.get(b.id)?.score ?? 100))
    .slice(0, Math.min(options.maxPages ?? settings.maxPages, 60));
  const works: PageWork[] = [];
  for (const page of candidates) {
    const snap = page.published!;
    const audit = auditOf.get(page.id)!;
    const slots = pageSlots(snap.sections);
    const content = audit.content;
    const status = (id: string) => audit.checks.find((c) => c.id === id)?.status ?? "ok";
    const ai = aiChecks(audit, { ...snap, id: page.id, translationGroup: page.translationGroup }, true);
    const aiStatusOf = (id: string) => ai.find((c) => c.id === id)?.status ?? "ok";
    const work = { page, snap };
    const task: PageTask = {
      id: "",
      locale: snap.locale,
      title: snap.title,
      brand: project.brand.name,
      text: clip(content.outline.join("\n"), 6000),
      facts,
    };
    const problems = audit.checks.filter((c) => ["title", "description", "duplicate-title", "duplicate-description"].includes(c.id) && c.status !== "ok").map((c) => `${c.label}: ${c.detail}`);
    const needTitle = status("title") !== "ok" || status("duplicate-title") !== "ok";
    const needDescription = status("description") !== "ok" || status("duplicate-description") !== "ok";
    if (needTitle || needDescription)
      task.meta = { title: needTitle, description: needDescription, currentTitle: snap.seo.title || snap.title, currentDescription: snap.seo.description, problems };
    const missingAlt = slots.filter((s) => s.kind === "alt" && !s.value.trim()).slice(0, 8);
    if (missingAlt.length) task.alts = missingAlt.map((s) => ({ ref: s.ref, image: s.image || "", context: s.context || snap.title }));
    if (content.faqs.length < 3 && content.words >= 100)
      task.faq = { count: Math.min(4, Math.max(2, 5 - content.faqs.length)), existing: content.faqs.map((f) => f.question) };
    if (aiStatusOf("ai-questions") !== "ok") {
      const h2 = slots.filter((s) => s.kind === "heading" && s.level === 2 && !["faq", "contact", "cta", "newsletter", "footer", "header"].includes(s.family) && s.value.length > 6).slice(0, 4);
      if (h2.length) task.headings = h2.map((s) => ({ ref: s.ref, text: one(s.value) }));
    }
    const h1 = slots.find((s) => s.kind === "heading" && s.level === 1);
    if (h1 && one(h1.value).length < 10) task.h1 = { ref: h1.ref, text: one(h1.value) };
    // Short answer at the top: the first formatted text of the first section starts with a long
    // block or a list, or does not mention what the H1 is about.
    const lead = slots.find((s) => s.sectionIndex === 0 && s.kind === "text" && s.rich && s.value.trim().length > 120);
    if (lead) {
      const first = lead.value.trim().split(/\n\s*\n/)[0];
      const topic = h1 ? [...stems(h1.value)] : [];
      const firstStems = stems(first);
      if (first.length > 280 || /^(-|\d+\.|\*\*)/.test(first) || (topic.length && !topic.some((w) => firstStems.has(w))))
        task.lead = { ref: lead.ref, text: first };
    }

    // ---- rules (free): outdated years, internal links, translations, mismatches
    const year = new Date().getFullYear();
    for (const slot of slots.filter((s) => s.kind === "text" || s.kind === "heading")) {
      const copy = slot.value.match(/(©|\(c\)|copyright)\s*(\d{4})/i);
      if (copy && Number(copy[2]) < year && Number(copy[2]) > 1990) {
        created.push(
          make(work, {
            type: "date",
            source: "rule",
            risk: "low",
            impact: "low",
            reason: `The copyright year ${copy[2]} looks outdated.`,
            flags: [],
            changes: [{ target: { kind: "field", sectionId: slot.sectionId, key: slot.key, collection: slot.collection, itemId: slot.itemId }, label: "Copyright year", before: slot.value, after: slot.value.replace(copy[0], copy[0].replace(copy[2], String(year))), editable: true }],
          }),
        );
        continue;
      }
      for (const m of slot.value.matchAll(/\b(20\d{2})\b/g)) {
        const y = Number(m[1]);
        if (y >= year || y < year - 3) continue;
        if (SINCE.test(slot.value.slice(Math.max(0, (m.index ?? 0) - 20), m.index))) continue;
        created.push(
          make(work, {
            type: "date",
            source: "rule",
            risk: "high",
            impact: "low",
            reason: `"${clip(one(slot.value), 120)}" mentions ${y}. Check that it is still current (prices, offers, seasons) and update the text by hand if not.`,
            flags: [],
            changes: [],
          }),
        );
        break;
      }
    }
    const linked = new Set(content.links.map((l) => l.href.toLowerCase()));
    const richText = slots.find((s) => s.kind === "text" && s.rich && s.value.length >= 200 && !/\]\(/.test(s.value));
    if (richText && content.links.filter((l) => l.href.startsWith(`/site/${siteKey}/`)).length < 3) {
      const mine = stems(`${snap.title} ${page.slug.replace(/-/g, " ")}`);
      const related = project.pages
        .filter((p) => !p.deletedAt && p.published && p.id !== page.id && p.id !== project.layout.homePageId && p.published.locale === snap.locale && !p.published.seo.noindex)
        .map((p) => ({ p, score: [...stems(`${p.published!.title} ${p.slug.replace(/-/g, " ")}`)].filter((w) => mine.has(w)).length }))
        .filter((r) => r.score > 0 && !linked.has(pageHref(project, siteKey, r.p).toLowerCase()))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      if (related.length) {
        const label = SEE_ALSO[snap.locale] || SEE_ALSO.en;
        const list = related.map((r) => `[${r.p.published!.title}](${pageHref(project, siteKey, r.p)})`).join(", ");
        created.push(
          make(work, {
            type: "link",
            source: "rule",
            risk: "medium",
            impact: "medium",
            reason: `Links to related pages help visitors and search engines: ${related.map((r) => r.p.published!.title).join(", ")}.`,
            flags: [],
            changes: [{ target: { kind: "field", sectionId: richText.sectionId, key: richText.key, collection: richText.collection, itemId: richText.itemId }, label: "Text with links", before: richText.value, after: `${richText.value.trimEnd()}\n\n**${label}** ${list}`, editable: true }],
          }),
        );
      }
    }
    if (languages && page.translationGroup) {
      const group = translationsOf(project.pages.filter((p) => !p.deletedAt), page).filter((p) => p.published);
      if (snap.locale === languages.default) {
        const have = new Set(group.map((p) => p.published!.locale));
        const missing = languages.enabled.filter((l) => !have.has(l));
        if (missing.length)
          created.push(
            make(work, {
              type: "missing-translation",
              source: "rule",
              risk: "high",
              impact: "medium",
              reason: `No published ${missing.map((l) => l.toUpperCase()).join(", ")} version of this page. Create it in the page editor → Language & translations.`,
              flags: [],
              changes: [],
            }),
          );
      } else {
        const original = group.find((p) => p.published!.locale === languages.default);
        const sameShape = original && original.published!.sections.map((s) => s.variant).join() === snap.sections.map((s) => s.variant).join();
        if (original && sameShape) {
          const position = (list: TextSlot[]) => {
            const seen: Record<number, number> = {};
            return new Map(list.map((s) => [`${s.sectionIndex}:${s.kind}:${(seen[s.sectionIndex] = (seen[s.sectionIndex] ?? -1) + 1)}`, s]));
          };
          const theirs = position(pageSlots(original.published!.sections));
          const translate: PageTask["translate"] = [];
          const mismatches: string[] = [];
          for (const [key, slot] of position(slots)) {
            const other = theirs.get(key);
            if (!other || slot.kind === "link") continue;
            const a = one(slot.value),
              b = one(other.value);
            if (a.length >= 25 && a === b && (scriptOf(a) === "cyr") !== (snap.locale === "ru")) {
              translate.push({ ref: slot.ref, text: slot.value, from: original.published!.locale });
              continue;
            }
            const na = [...new Set(numbersIn(a))].sort().join(" "),
              nb = [...new Set(numbersIn(b))].sort().join(" ");
            if (na && nb && na !== nb && mismatches.length < 3)
              mismatches.push(`${original.published!.locale.toUpperCase()}: "${clip(b, 90)}" — ${snap.locale.toUpperCase()}: "${clip(a, 90)}"`);
          }
          if (translate.length) task.translate = translate.slice(0, 6);
          if (mismatches.length)
            created.push(
              make(work, {
                type: "mismatch",
                source: "rule",
                risk: "high",
                impact: "high",
                reason: `Numbers differ between the language versions (prices, phones, dates?). Check which one is right and fix the other by hand:\n${mismatches.join("\n")}`,
                flags: [],
                changes: [],
              }),
            );
        }
      }
    }
    const wantsAi = !!(task.meta || task.alts || task.faq || task.headings || task.h1 || task.lead || task.translate);
    const hash = createHash("sha256")
      .update(JSON.stringify([PROMPT_VERSION, snap.locale, snap.seo.title, snap.seo.description, slots.map((s) => s.value), task]))
      .digest("hex")
      .slice(0, 24);
    works.push({ page, snap, audit, slots, task, hash, wantsAi });
  }
  run.pages = works.length;

  // ---- AI: pages of one language in batches of 3, cached by content hash, within the budget
  const aiWork = works.filter((w) => {
    if (!w.wantsAi) return false;
    if (state.cache[w.page.id] === w.hash) {
      run.cachedPages++;
      return false;
    }
    return true;
  });
  const status = await aiStatus();
  const spentThisMonth = () => (state.months[month()]?.cost ?? 0) + run.cost;
  const byLocale = new Map<string, PageWork[]>();
  for (const w of aiWork) byLocale.set(w.snap.locale, [...(byLocale.get(w.snap.locale) ?? []), w]);
  const cached: string[] = [];
  if (aiWork.length && !mock && !status.enabled) run.stopped = "AI is switched off (CMS_AI): only rule-based suggestions.";
  else
    outer: for (const [locale, list] of byLocale) {
      for (let i = 0; i < list.length; i += 3) {
        const batch = list.slice(i, i + 3);
        if (!mock && spentThisMonth() >= settings.budgetUsd) {
          run.stopped = `Monthly budget of $${settings.budgetUsd.toFixed(2)} reached.`;
          break outer;
        }
        batch.forEach((w, n) => (w.task.id = `p${n + 1}`));
        const tasks = batch.map((w) => w.task);
        let answer: { text: string; cost: number; tokensIn: number; tokensOut: number };
        try {
          answer = await aiComplete({
            system: systemPrompt(locale),
            user: userPrompt(tasks),
            maxTokens: Math.min(1400 * batch.length, 4000),
            json: true,
            useMock: mock,
            mock: mockAnswer(tasks),
          });
        } catch (e) {
          run.stopped = e instanceof Error ? e.message : "The AI service failed.";
          break outer;
        }
        run.calls++;
        run.cost += answer.cost;
        run.tokensIn += answer.tokensIn;
        run.tokensOut += answer.tokensOut;
        let pages: AiPage[] = [];
        try {
          pages = answerPages(parseJson(answer.text));
        } catch {
          (run.notes ??= []).push(`Not JSON: ${clip(one(answer.text), 300)}`);
          continue;
        }
        for (const w of batch) {
          const out =
            pages.find((p) => String(p.id ?? "").match(/p\d+/i)?.[0].toLowerCase() === w.task.id) ??
            (batch.length === 1 && pages.length === 1 ? pages[0] : undefined);
          if (!out) {
            (run.notes ??= []).push(`No answer for "${w.snap.title}": ${clip(one(answer.text), 300)}`);
            continue;
          }
          run.aiPages++;
          cached.push(w.page.id);
          created.push(...aiSuggestions(project, w, out, corpus, mock).map((s) => make(w, s)));
        }
      }
    }

  // ---- store: stale check of older pending items, de-duplication, run log, score snapshot
  const fresh = await readProject(siteId);
  return store(siteId, (doc) => {
    for (const s of doc.suggestions.filter((x) => x.status === "pending" && x.changes.length))
      if (!stillApplies(fresh, s)) {
        s.status = "stale";
        s.decidedAt = now;
      }
    const targetKey = (s: Suggestion) => `${s.pageId}|${s.type}|${JSON.stringify(s.changes.map((c) => ({ ...c.target, items: undefined })))}|${s.changes.length ? "" : s.reason}`;
    const open = new Set(doc.suggestions.filter((s) => s.status === "pending" || (s.source === "rule" && s.status === "rejected")).map(targetKey));
    const added = created.filter((s) => !open.has(targetKey(s)));
    doc.suggestions.unshift(...added);
    // Keep every pending item; drop the oldest decided ones over 600.
    const pending = doc.suggestions.filter((s) => s.status === "pending");
    const decided = doc.suggestions.filter((s) => s.status !== "pending").slice(0, Math.max(0, 600 - pending.length));
    doc.suggestions = [...pending, ...decided].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const id of cached) doc.cache[id] = works.find((w) => w.page.id === id)!.hash;
    run.suggestions = added.length;
    const m = (doc.months[month()] ??= { cost: 0, calls: 0 });
    m.cost = Math.round((m.cost + run.cost) * 1e6) / 1e6;
    m.calls += run.mock ? 0 : run.calls;
    doc.scores[month()] ??= average(audits);
    doc.runs.unshift(run);
    doc.runs = doc.runs.slice(0, 40);
    return run;
  });
}

function aiSuggestions(project: Project, w: PageWork, out: AiPage, corpus: Corpus, mock: boolean) {
  type Draft = Omit<Suggestion, "id" | "runId" | "createdAt" | "pageId" | "pageTitle" | "pageSlug" | "locale" | "status">;
  const list: Draft[] = [];
  const { snap, task, slots } = w;
  const locale = snap.locale;
  const pageText = task.text;
  const testFlag = mock ? ["Test mode: canned text, not written by AI"] : [];
  const check = (value: string) => [...testFlag, ...factFlags(value, corpus, pageText), ...languageFlags(value, locale)];
  const slot = (ref?: string) => slots.find((s) => s.ref === ref);
  const fieldTarget = (s: TextSlot): ChangeTarget => ({ kind: "field", sectionId: s.sectionId, key: s.key, collection: s.collection, itemId: s.itemId });
  const notes = (out.notes ?? []).filter((n) => typeof n === "string").map((n) => `AI note: ${clip(n, 200)}`);
  if (task.meta?.title && out.title?.trim()) {
    const after = one(out.title);
    const flags = check(after);
    if (after.length < LIMITS.title.min - 5 || after.length > LIMITS.title.max + 5) flags.push(`${after.length} characters (aim for ${LIMITS.title.min}–${LIMITS.title.max})`);
    list.push({ type: "meta-title", source: "ai", risk: "low", impact: snap.seo.title ? "medium" : "high", reason: task.meta.problems.find((p) => /title/i.test(p)) || "The SEO title can be clearer.", flags: [...flags, ...notes], changes: [{ target: { kind: "seo", field: "title" }, label: "SEO title", before: snap.seo.title, after, editable: true }] });
  }
  if (task.meta?.description && out.description?.trim()) {
    const after = one(out.description);
    const flags = check(after);
    if (after.length < LIMITS.description.min - 10 || after.length > LIMITS.description.max + 5) flags.push(`${after.length} characters (aim for ${LIMITS.description.min}–${LIMITS.description.max})`);
    list.push({ type: "meta-description", source: "ai", risk: "low", impact: snap.seo.description ? "medium" : "high", reason: task.meta.problems.find((p) => /description/i.test(p)) || "The meta description can say more clearly what the page offers.", flags, changes: [{ target: { kind: "seo", field: "description" }, label: "Meta description", before: snap.seo.description, after, editable: true }] });
  }
  const alts = (out.alts ?? []).map((a) => ({ s: slot(a.ref), alt: one(a.alt || "") })).filter((a) => a.s && a.s.kind === "alt" && !a.s.value.trim() && a.alt);
  if (alts.length) {
    const flags = [...new Set(alts.flatMap((a) => check(a.alt)))];
    list.push({
      type: "alt",
      source: "ai",
      risk: "low",
      impact: "medium",
      reason: `${alts.length} image${alts.length > 1 ? "s have" : " has"} no alt text. Written from the text around the image, not from the picture itself: check it matches.`,
      flags,
      changes: alts.map((a) => ({ target: fieldTarget(a.s!), label: `Alt text: ${(a.s!.image || "").split("/").pop()}`, before: "", after: clip(a.alt, 125), editable: true })),
    });
  }
  const faq = (out.faq ?? []).map((f) => ({ q: one(f.q || ""), a: one(f.a || "") })).filter((f) => f.q && f.a).slice(0, 4);
  if (task.faq && faq.length) {
    const { target, structural } = faqTarget(project, snap, faq);
    list.push({
      type: "faq",
      source: "ai",
      risk: structural ? "high" : "medium",
      impact: "high",
      reason: `${faq.length} questions answered with this page's own text: answer engines (Google AI Overviews, ChatGPT search) quote FAQ blocks; FAQPage data is generated.${structural ? " Adds a new FAQ section to the page." : ""}`,
      flags: [...new Set(faq.flatMap((f) => check(`${f.q} ${f.a}`)))],
      changes: [{ target, label: structural ? "New FAQ section" : "New FAQ questions", before: "", after: faqText(faq), editable: true }],
      structural,
    });
  }
  for (const h of (out.headings ?? []).slice(0, 2)) {
    const s = slot(h.ref);
    const text = one(h.text || "");
    if (!s || s.kind !== "heading" || !text || text === one(s.value)) continue;
    list.push({ type: "heading", source: "ai", risk: "medium", impact: "medium", reason: "A heading phrased as the question people search for helps answer engines quote the section below it.", flags: check(text), changes: [{ target: fieldTarget(s), label: "H2 heading", before: s.value, after: text, editable: true }] });
  }
  if (task.h1 && out.h1?.text) {
    const s = slot(task.h1.ref);
    if (s) list.push({ type: "h1", source: "ai", risk: "medium", impact: "high", reason: "The main heading is too short to say what the page is about.", flags: check(out.h1.text), changes: [{ target: fieldTarget(s), label: "Main heading", before: s.value, after: one(out.h1.text), editable: true }] });
  }
  if (task.lead && out.lead?.text) {
    const s = slot(task.lead.ref);
    const text = one(out.lead.text);
    if (s && text)
      list.push({ type: "lead", source: "ai", risk: "medium", impact: "medium", reason: "A 1–2 sentence direct answer at the top tells visitors and AI answers right away what the page offers.", flags: check(text), changes: [{ target: fieldTarget(s), label: "Text at the top", before: s.value, after: `${text}\n\n${s.value.trimStart()}`, editable: true }] });
  }
  const translations = (out.translations ?? []).map((t) => ({ s: slot(t.ref), text: (t.text || "").trim() })).filter((t) => t.s && t.text && t.text !== t.s.value);
  if (translations.length)
    list.push({
      type: "translation",
      source: "ai",
      risk: "medium",
      impact: "medium",
      reason: `${translations.length} text${translations.length > 1 ? "s were" : " was"} left in another language on this ${locale.toUpperCase()} page.`,
      flags: [...new Set(translations.flatMap((t) => check(t.text)))],
      changes: translations.map((t) => ({ target: fieldTarget(t.s!), label: t.s!.kind === "heading" ? "Heading" : "Text", before: t.s!.value, after: t.text, editable: true })),
    });
  return list;
}

// ------------------------------------------------------------------ apply / undo
function stillApplies(project: Project, s: Suggestion) {
  const page = project.pages.find((p) => p.id === s.pageId && !p.deletedAt);
  if (!page) return false;
  return s.changes.every((c) => {
    if (c.target.kind === "seo") return one(page.seo[c.target.field]) === one(c.before);
    if (c.target.kind === "field") return readTarget(page.sections, c.target) === c.before;
    if (c.target.kind === "faq-add") return page.sections.some((x) => x.id === (c.target as { sectionId: string }).sectionId);
    return true;
  });
}
const deny = (message: string) => new StoreError(message, 403);
function materialize(section: Section, collection: string) {
  const entry = definition(section.variant);
  const group = entry?.repeaters?.find((r) => r.id === collection);
  if (!entry || !group) return null;
  section.collections ??= {};
  section.collections[collection] ??= collectionItems(section, entry, group).map((i) => ({
    ...i,
    id: i.id.startsWith("initial-") ? newId() : i.id,
    values: { ...i.values },
  }));
  return { list: section.collections[collection], max: group.max ?? 30 };
}
// Applies one change to one copy of the page (draft or published). Returns ids it created.
function applyChange(page: { sections: Section[]; seo: CmsPage["seo"] }, change: SuggestionChange, ids: string[], strict: boolean) {
  const t = change.target;
  if (t.kind === "seo") {
    if (strict && one(page.seo[t.field]) !== one(change.before)) throw new StoreError("The page changed since this suggestion. Run the assistant again.", 409);
    if (!strict && one(page.seo[t.field]) !== one(change.before)) return false;
    page.seo[t.field] = change.after;
    return true;
  }
  if (t.kind === "field") {
    const current = readTarget(page.sections, t);
    if (current !== change.before) {
      if (strict) throw new StoreError("The text changed since this suggestion. Run the assistant again.", 409);
      return false;
    }
    return writeTarget(page.sections, t, change.after);
  }
  const items = parseFaq(change.after);
  if (!items.length) throw new StoreError("Write at least one question and answer (question on the first line, answer below, blank line between).");
  if (t.kind === "faq-add") {
    const section = page.sections.find((s) => s.id === t.sectionId);
    if (!section) {
      if (strict) throw new StoreError("The FAQ section was removed. Run the assistant again.", 409);
      return false;
    }
    const target = materialize(section, t.collection);
    if (!target) return false;
    const template = t.items[0]?.template ?? 0;
    const keys = faqKeys(section.variant, template);
    if (target.list.length + items.length > target.max) throw new StoreError("The FAQ list is full.");
    items.forEach((item, n) => target.list.push({ id: ids[n], template, values: { [keys.q]: item.q, [keys.a]: item.a } }));
    return true;
  }
  // section-add
  const section = createSection(t.variant, ids[0]);
  Object.assign(section.values, t.values);
  section.collections = {
    [t.collection]: items.map((item, n) => {
      const template = n === 0 || (definition(t.variant)?.repeaters?.[0]?.items.length ?? 1) < 2 ? 0 : 1;
      const keys = faqKeys(t.variant, template);
      return { id: ids[n + 1], template, values: { [keys.q]: item.q, [keys.a]: item.a } };
    }),
  };
  const at = t.beforeSectionId ? page.sections.findIndex((s) => s.id === t.beforeSectionId) : -1;
  page.sections.splice(at >= 0 ? at : page.sections.length, 0, section);
  return true;
}
function revertChange(page: { sections: Section[]; seo: CmsPage["seo"] }, change: SuggestionChange, created: string[]) {
  const t = change.target;
  if (t.kind === "seo") {
    if (one(page.seo[t.field]) !== one(change.after)) return false;
    page.seo[t.field] = change.before;
    return true;
  }
  if (t.kind === "field") {
    if (readTarget(page.sections, t) !== change.after) return false;
    return writeTarget(page.sections, t, change.before);
  }
  if (t.kind === "faq-add") {
    const section = page.sections.find((s) => s.id === t.sectionId);
    const list = section?.collections?.[t.collection];
    if (!section || !list) return false;
    section.collections![t.collection] = list.filter((i) => !created.includes(i.id));
    return true;
  }
  const index = page.sections.findIndex((s) => s.id === created[0]);
  if (index < 0) return false;
  page.sections.splice(index, 1);
  return true;
}
function checkClient(page: CmsPage, s: Suggestion, publish: boolean, pack: boolean) {
  if (!pack) throw deny("Approving SEO suggestions needs the SEO pack.");
  if (s.structural) throw deny("This suggestion adds a section: ask your administrator.");
  if (page.clientAccess?.edit === false) throw deny("Editing this page is managed by your administrator.");
  if (publish && page.clientAccess?.publish === false) throw deny("Publishing this page is managed by your administrator.");
  for (const c of s.changes) {
    const t = c.target;
    if (t.kind === "field" || t.kind === "faq-add") {
      const section = page.sections.find((x) => x.id === t.sectionId);
      if (t.kind === "field" && section?.clientAccess?.text === false) throw deny("This section's text is locked by your administrator.");
      if (t.kind === "faq-add" && section?.clientAccess?.collections && !section.clientAccess.collections.includes(t.collection))
        throw deny("This list is locked by your administrator.");
    }
  }
}
// Saves changed pages: draft only, or draft + the published copy patched with only these
// changes (other unpublished draft edits stay unpublished).
async function savePages(siteId: string, project: Project, originals: Map<string, CmsPage>, publish: boolean) {
  if (!publish) return writeProject(project, undefined, "super-admin", { siteId });
  const now = new Date().toISOString();
  for (const [id, old] of originals) {
    const page = project.pages.find((p) => p.id === id)!;
    page.history = [{ ...pageSnapshot(old), id: newId(), updatedAt: now, kind: "Published" as const }, ...(old.history ?? [])].slice(0, 20);
    page.updatedAt = now;
    if (page.published) page.published.updatedAt = now;
  }
  return writeProject(project, undefined, "super-admin", { siteId, restore: true });
}

export interface Decision {
  ids: string[];
  action: "approve" | "reject" | "undo";
  publish?: boolean;
  // Reviewer edits: suggestion id → change index → new text.
  edits?: Record<string, Record<string, string>>;
}
export async function decide(siteId: string, input: Decision, who: { name: string; role: Role }) {
  if (who.role === "client" && !(await seoPack(siteId))) throw deny("Approving SEO suggestions needs the SEO pack.");
  const state = await readAssistant(siteId);
  const list = input.ids.map((id) => state.suggestions.find((s) => s.id === id)).filter(Boolean) as Suggestion[];
  if (!list.length) throw new StoreError("Suggestion not found.", 404);
  const pack = await seoPack(siteId);
  const now = new Date().toISOString();
  const publish = !!input.publish;
  if (input.action === "reject") {
    if (who.role === "client" && !pack) throw deny("Needs the SEO pack.");
    return store(siteId, (doc) => {
      for (const s of doc.suggestions.filter((x) => input.ids.includes(x.id) && x.status === "pending"))
        Object.assign(s, { status: "rejected", decidedAt: now, decidedBy: who.name });
      return { done: list.length };
    });
  }
  const project = await readProject(siteId);
  const next = structuredClone(project);
  const originals = new Map<string, CmsPage>();
  const results: Record<string, { created?: string[]; changes?: SuggestionChange[]; published: boolean }> = {};
  for (const s of list) {
    const page = next.pages.find((p) => p.id === s.pageId && !p.deletedAt);
    if (!page) throw new StoreError(`The page "${s.pageTitle}" no longer exists.`, 409);
    if (who.role === "client") checkClient(page, s, input.action === "undo" ? !!s.published : publish, pack);
    if (!originals.has(page.id)) originals.set(page.id, structuredClone(project.pages.find((p) => p.id === page.id)!));
    if (input.action === "approve") {
      if (s.status !== "pending") throw new StoreError("This suggestion was already decided.", 409);
      const changes = s.changes.map((c, n) => {
        const edited = input.edits?.[s.id]?.[String(n)];
        return edited !== undefined && c.editable ? { ...c, after: edited.trim() } : c;
      });
      const created: string[] = [];
      for (const c of changes) {
        const count = c.target.kind === "faq-add" ? parseFaq(c.after).length : c.target.kind === "section-add" ? parseFaq(c.after).length + 1 : 0;
        const ids = Array.from({ length: count }, newId);
        applyChange(page, c, ids, true);
        if (publish && page.published) applyChange(page.published, c, ids, false);
        created.push(...ids);
      }
      results[s.id] = { created, changes, published: publish && !!page.published };
    } else {
      if (s.status !== "approved") throw new StoreError("Only approved suggestions can be undone.", 409);
      for (const c of s.changes) {
        if (!revertChange(page, c, s.created ?? []))
          throw new StoreError("The text was changed after approving; undo it by hand in the page editor (page history).", 409);
        if (s.published && page.published) revertChange(page.published, c, s.created ?? []);
      }
      results[s.id] = { published: !!s.published };
    }
  }
  const anyPublish = Object.values(results).some((r) => r.published);
  // Advice-only suggestions (no changes) only change status.
  if (list.some((s) => s.changes.length)) await savePages(siteId, next, originals, anyPublish);
  if (anyPublish) for (const id of originals.keys()) void afterPublish(siteId, id);
  return store(siteId, (doc) => {
    for (const s of doc.suggestions.filter((x) => results[x.id])) {
      const r = results[s.id];
      if (input.action === "approve") Object.assign(s, { status: "approved", decidedAt: now, decidedBy: who.name, published: r.published, created: r.created, changes: r.changes });
      else Object.assign(s, { status: "undone", decidedAt: now, decidedBy: who.name });
    }
    return { done: list.length, published: anyPublish };
  });
}

// Reviewer's instruction ("shorter", "mention Riga"): the AI rewrites one change of a pending
// suggestion. Used by the queue's "Revise" and by the approvals bot.
export async function revise(siteId: string, input: { id: string; change?: number; instruction: string }, who: { name: string }) {
  const state = await readAssistant(siteId);
  const s = state.suggestions.find((x) => x.id === input.id);
  if (!s || s.status !== "pending") throw new StoreError("Suggestion not found.", 404);
  const index = input.change ?? 0;
  const change = s.changes[index];
  if (!change?.editable) throw new StoreError("This suggestion cannot be revised.");
  const project = await readProject(siteId);
  const page = project.pages.find((p) => p.id === s.pageId);
  const snap = page?.published ?? page;
  if (!snap) throw new StoreError("The page no longer exists.", 409);
  const text = clip(pageContent(snap.sections).outline.join("\n"), 6000);
  const mock = state.settings.testMode;
  if (!mock && (state.months[month()]?.cost ?? 0) >= state.settings.budgetUsd) throw new StoreError("The monthly AI budget of this website is used up.", 429);
  const prompt = revisePrompt(s.locale, { label: change.label, before: change.before, after: change.after, instruction: input.instruction, text });
  const answer = await aiComplete({ ...prompt, maxTokens: 1200, json: true, useMock: mock, mock: JSON.stringify({ text: `${change.after} (${input.instruction})` }) });
  let after = "";
  try {
    after = String((parseJson(answer.text) as { text?: string }).text || "").trim();
  } catch {
    after = "";
  }
  if (!after) throw new StoreError("The AI answer could not be read; try again.", 502);
  const corpus = siteCorpus(project);
  return store(siteId, (doc) => {
    const item = doc.suggestions.find((x) => x.id === input.id)!;
    item.changes[index] = { ...item.changes[index], after };
    item.flags = [...new Set([...(mock ? ["Test mode: canned text, not written by AI"] : []), ...factFlags(after, corpus, text), ...languageFlags(after, s.locale)])];
    item.revisions = [...(item.revisions ?? []), { at: new Date().toISOString(), by: who.name, instruction: clip(input.instruction, 500) }];
    const m = (doc.months[month()] ??= { cost: 0, calls: 0 });
    m.cost = Math.round((m.cost + answer.cost) * 1e6) / 1e6;
    m.calls += mock ? 0 : 1;
    return { suggestion: item, cost: answer.cost };
  });
}

// ------------------------------------------------------------------ monthly report
export async function buildReport(siteId: string, siteKey: string, forMonth = month()): Promise<MonthlyReport> {
  const [state, project] = await Promise.all([readAssistant(siteId), readProject(siteId)]);
  const audits = auditSite(project, siteKey);
  const approved = state.suggestions.filter((s) => s.status === "approved" && s.decidedAt?.startsWith(forMonth));
  const changes = approved.flatMap((s) =>
    (s.changes.length ? s.changes : [{ label: SUGGESTION_TYPES[s.type].label, before: "", after: "(done by hand)" } as SuggestionChange]).map((c) => ({
      pageTitle: s.pageTitle,
      locale: s.locale,
      type: s.type,
      label: c.label,
      before: clip(c.before, 300),
      after: clip(c.after, 300),
      at: s.decidedAt!,
    })),
  );
  let pages: MonthlyReport["pages"] = [];
  try {
    const { analyticsReport } = await import("../analytics");
    const [last, both] = await Promise.all([analyticsReport(siteId, 30), analyticsReport(siteId, 60)]);
    const ids = [...new Set(approved.map((s) => s.pageId))];
    pages = ids.map((id) => {
      const a = last.pages.find((p) => p.id === id);
      const b = both.pages.find((p) => p.id === id);
      return {
        pageId: id,
        title: approved.find((s) => s.pageId === id)!.pageTitle,
        views: a?.views ?? 0,
        prevViews: Math.max(0, (b?.views ?? 0) - (a?.views ?? 0)),
        visitors: a?.visitors ?? 0,
        prevVisitors: Math.max(0, (b?.visitors ?? 0) - (a?.visitors ?? 0)),
      };
    });
  } catch {
    pages = [];
  }
  const rank = { high: 0, medium: 1, low: 2 };
  const pendingList = state.suggestions.filter((s) => s.status === "pending");
  const next: MonthlyReport["next"] = [...pendingList]
    .sort((a, b) => rank[a.impact] - rank[b.impact])
    .slice(0, 6)
    .map((s) => ({ pageTitle: s.pageTitle, label: SUGGESTION_TYPES[s.type].label, reason: clip(s.reason, 160) }));
  if (!next.length)
    for (const a of [...audits].sort((x, y) => x.score - y.score).slice(0, 3))
      for (const c of a.checks.filter((c) => c.status !== "ok").slice(0, 2)) next.push({ pageTitle: a.title, label: c.label, reason: c.detail });
  const scoreBefore = state.scores[forMonth] ?? null;
  const scoreAfter = average(audits);
  const cost = state.months[forMonth]?.cost ?? 0;
  const calls = state.months[forMonth]?.calls ?? 0;
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / b) * 100))}%` : a ? "new" : "—");
  const text = [
    `${project.brand.name} — SEO assistant report ${forMonth}`,
    "",
    `SEO score: ${scoreBefore ?? "—"} → ${scoreAfter}`,
    `Approved changes: ${changes.length}; waiting for approval: ${pendingList.length}`,
    "",
    ...(changes.length ? ["What changed:", ...changes.slice(0, 20).map((c) => `- ${c.pageTitle} (${c.locale.toUpperCase()}), ${c.label}: ${clip(one(c.after), 110)}`)] : ["No changes approved this month."]),
    ...(pages.length ? ["", "Changed pages, last 30 days vs the 30 before:", ...pages.map((p) => `- ${p.title}: ${p.views} views (${delta(p.views, p.prevViews)}), ${p.visitors} visitors (${delta(p.visitors, p.prevVisitors)})`)] : []),
    "",
    "Next:",
    ...(next.length ? next.map((n) => `- ${n.pageTitle}: ${n.label} — ${n.reason}`) : ["- Nothing urgent."]),
    "",
    `AI cost this month: $${cost.toFixed(4)} (${calls} calls).`,
  ].join("\n");
  return { month: forMonth, generatedAt: new Date().toISOString(), scoreBefore, scoreAfter, changes, pages, next, cost, calls, pending: pendingList.length, text };
}

// Sends the report through the channels switched on in Analytics → Weekly report.
export async function sendReport(siteId: string, report: MonthlyReport) {
  const [{ readAnalyticsConfig }, { weeklyChannels }, { mailConnection }] = await Promise.all([
    import("../analytics-config"),
    import("../analytics-weekly"),
    import("../smtp"),
  ]);
  const config = await readAnalyticsConfig(siteId);
  const results: Record<string, string> = {};
  const project = await readProject(siteId);
  const subject = `${project.brand.name.replace(/[\r\n]/g, " ").slice(0, 80)}: SEO report ${report.month}`;
  if (config.weekly.email) {
    const recipient = project.forms?.recipient || "";
    let connection: Awaited<ReturnType<typeof mailConnection>> = null;
    try {
      connection = recipient ? await mailConnection(siteId) : null;
      if (!connection) results.email = "skipped";
      else {
        await connection.transport.sendMail({ from: connection.from, to: recipient, subject, text: report.text });
        results.email = "sent";
      }
    } catch {
      results.email = "failed";
    } finally {
      connection?.transport.close();
    }
  }
  if (config.weekly.telegram)
    for (const channel of weeklyChannels().filter((c) => /telegram/i.test(c.name)))
      results[channel.name] = await channel
        .send(siteId, { siteId, siteName: project.brand.name, from: report.month, to: report.month, subject, rows: [], topPages: [], goals: [], text: report.text })
        .catch(() => "failed" as const);
  await store(siteId, (doc) => {
    doc.reports[report.month] = { sentAt: new Date().toISOString(), result: Object.entries(results).map(([k, v]) => `${k}: ${v}`).join(", ") || "no channel switched on" };
  });
  return results;
}

// Cron: once a month per website with "Monthly run" on and the SEO pack: run, then send the
// previous month's report. Everything else is a no-op.
export async function monthlyTick(siteId: string, siteKey: string) {
  const state = await readAssistant(siteId);
  if (!state.settings.monthly || state.lastMonthly === month() || !(await seoPack(siteId))) return null;
  await store(siteId, (doc) => {
    doc.lastMonthly = month();
  });
  const run = await runAssistant(siteId, siteKey, { by: "monthly", trigger: "monthly" });
  let sent: Record<string, string> | null = null;
  if (state.settings.report) {
    const previous = month(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 15)));
    sent = await sendReport(siteId, await buildReport(siteId, siteKey, previous));
  }
  return { run, sent };
}
