// Prompts of the AI SEO assistant, one style guide per output language. Server and client safe.
// Bump PROMPT_VERSION when the prompts change: cached pages are then re-checked.
export const PROMPT_VERSION = 1;

const STYLE: Record<string, string> = {
  lv: [
    "Write in natural, modern Latvian, as a native Latvian copywriter would.",
    "Always use correct Latvian diacritics: ā č ē ģ ī ķ ļ ņ š ū ž (and capitals Ā Č Ē Ģ Ī Ķ Ļ Ņ Š Ū Ž). Never replace them with plain letters, digraphs (sh, ch) or apostrophes.",
    "Address the reader politely in the plural (Jūs / Jums / Jūsu) where an address is needed.",
    "Use correct case endings and noun-adjective agreement; avoid word-for-word calques from English or Russian.",
    "Sentence case for titles and headings (only the first word and proper names capitalised).",
    "Latvian question words: Kā, Kas, Kāpēc, Cik, Kad, Kur, Vai.",
  ].join("\n"),
  ru: [
    "Write in natural, modern Russian, as a native Russian copywriter in Latvia would.",
    "Address the reader as «вы» (lower case), no bureaucratic style (канцелярит), no English calques.",
    "Sentence case for titles and headings. Use the letter «ё» only where the original text uses it.",
    "Use «ёлочки» quotation marks.",
  ].join("\n"),
  en: [
    "Write in plain, clear British English.",
    "Sentence case for titles and headings. No hype words (unlock, elevate, seamless, cutting-edge, unleash).",
  ].join("\n"),
  de: [
    "Write in natural German as a native copywriter would, formal «Sie».",
    "Correct umlauts and ß; nouns capitalised, otherwise sentence case for headings.",
  ].join("\n"),
};
export const LANGUAGE_NAME: Record<string, string> = { lv: "Latvian", ru: "Russian", en: "English", de: "German" };

export function systemPrompt(locale: string) {
  return [
    "You are an SEO editor improving EXISTING pages of a small-business website. A human reviews every suggestion before anything is published.",
    `Output language for page texts: ${LANGUAGE_NAME[locale] || locale}, unless a task says otherwise.`,
    STYLE[locale] || STYLE.en,
    "",
    "HARD RULES:",
    "- Use ONLY facts written in the page text you are given (and the business facts block). Never invent prices, numbers, discounts, guarantees, warranties, years, addresses, phone numbers, opening hours, certificates, ratings, awards, client names, place names or service areas.",
    "- If a good text would need a fact that is not given, write it without that fact. Never use placeholders.",
    "- Do not make claims like «the best», «No. 1», «cheapest», «guaranteed».",
    "- Keep the meaning and tone of the page; improve clarity for people first, search engines second.",
    "- If you are unsure about something, put a short note in the item's \"note\" field.",
    "- Skip a task (return an empty list / omit it) when the page has nothing useful for it.",
    "",
    "LENGTHS: SEO title 30–60 characters (may end with \" | \" + brand if it fits). Meta description 70–155 characters, one or two sentences, says what the page offers and for whom. Image alt text 5–125 characters, describes what the picture most likely shows, based ONLY on the context given; no «image of», «photo of». FAQ: 2–4 questions a customer really asks, each answer 1–3 sentences (max 300 characters) answering directly, using only facts from the page. Short answer at the top: 1–2 sentences (max 220 characters) that directly say what the page offers, for whom and where — only page facts.",
    "",
    "Answer with ONE JSON object only, no markdown, matching the requested shape.",
  ].join("\n");
}

export interface PageTask {
  id: string; // page key in the answer ("p1")
  locale: string;
  title: string;
  brand: string;
  text: string; // readable outline of the page (headings + paragraphs)
  facts: string; // business facts (address, phone…) from the website settings
  meta?: { title: boolean; description: boolean; currentTitle: string; currentDescription: string; problems: string[] };
  alts?: { ref: string; image: string; context: string }[];
  faq?: { count: number; existing: string[] };
  headings?: { ref: string; text: string }[];
  h1?: { ref: string; text: string };
  lead?: { ref: string; text: string };
  translate?: { ref: string; text: string; from: string }[];
}

export function userPrompt(tasks: PageTask[]) {
  const shape = `{"pages":[{"id":"p1","title":"…","description":"…","alts":[{"ref":"s3","alt":"…"}],"faq":[{"q":"…","a":"…"}],"headings":[{"ref":"s5","text":"…"}],"h1":{"ref":"s1","text":"…"},"lead":{"ref":"s2","text":"…"},"translations":[{"ref":"s7","text":"…"}],"notes":["…"]}]}`;
  const parts = tasks.map((t) => {
    const lines = [
      `=== PAGE ${t.id} — language: ${LANGUAGE_NAME[t.locale] || t.locale} — brand: ${t.brand}`,
      `Page name: ${t.title}`,
      t.facts ? `Business facts:\n${t.facts}` : "",
      `Page text:\n${t.text}`,
      "TASKS for this page:",
    ];
    if (t.meta?.title)
      lines.push(`- "title": a new SEO title. Current: "${t.meta.currentTitle}". Problems: ${t.meta.problems.join("; ") || "none"}.`);
    if (t.meta?.description)
      lines.push(`- "description": a new meta description. Current: "${t.meta.currentDescription}". Problems: ${t.meta.problems.join("; ") || "none"}.`);
    if (t.alts?.length)
      lines.push(`- "alts": alt text for these images (file name and the text around them):\n${t.alts.map((a) => `  ${a.ref}: file "${a.image.split("/").pop()}", context: ${a.context}`).join("\n")}`);
    if (t.faq)
      lines.push(`- "faq": ${t.faq.count} new questions with answers, from this page's text only${t.faq.existing.length ? `; do not repeat: ${t.faq.existing.join(" | ")}` : ""}. Return [] if the text does not answer real questions.`);
    if (t.headings?.length)
      lines.push(`- "headings": rephrase at most 2 of these H2 headings as a natural question a customer would ask, only where it fits; keep the meaning:\n${t.headings.map((h) => `  ${h.ref}: ${h.text}`).join("\n")}`);
    if (t.h1) lines.push(`- "h1": a clearer main heading (max 70 characters) saying what the page is about. Current ${t.h1.ref}: "${t.h1.text}".`);
    if (t.lead) lines.push(`- "lead": a short direct answer paragraph for the top of the page (ref ${t.lead.ref}).`);
    if (t.translate?.length)
      lines.push(`- "translations": these texts were left in another language; translate each into ${LANGUAGE_NAME[t.locale] || t.locale}, keeping line breaks, **bold**, list markers and [label](url) links exactly:\n${t.translate.map((x) => `  ${x.ref}: ${JSON.stringify(x.text)}`).join("\n")}`);
    return lines.filter(Boolean).join("\n");
  });
  return `${parts.join("\n\n")}\n\nReturn exactly this JSON shape (omit keys for tasks not asked): ${shape}`;
}

// Revising one suggestion after a reviewer's instruction (approvals bot, "Edit" in the queue).
export function revisePrompt(locale: string, input: { label: string; before: string; after: string; instruction: string; text: string }) {
  return {
    system: systemPrompt(locale),
    user: [
      `Page text (the only source of facts):\n${input.text}`,
      "",
      `Field: ${input.label}`,
      `Original value: ${JSON.stringify(input.before)}`,
      `Suggested value: ${JSON.stringify(input.after)}`,
      `Reviewer's instruction: ${JSON.stringify(input.instruction)}`,
      "",
      'Rewrite the suggested value following the instruction and all rules. Answer {"text":"…","note":"…"}.',
    ].join("\n"),
  };
}

// Words that introduce a founding year ("since 2010"): such years are not outdated.
export const SINCE = /(since|founded|established|kopš|dibināt|с\s|основан|seit|gegründet)\s*$/i;
export const SEE_ALSO: Record<string, string> = { lv: "Skatiet arī:", ru: "Смотрите также:", en: "See also:", de: "Siehe auch:" };
export const FAQ_HEADING: Record<string, string> = {
  lv: "Biežāk uzdotie jautājumi",
  ru: "Часто задаваемые вопросы",
  en: "Frequently asked questions",
  de: "Häufige Fragen",
};
