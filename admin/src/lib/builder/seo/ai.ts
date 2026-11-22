// AI search: crawler tokens for robots.txt and llms.txt / llms-full.txt (llmstxt.org).
// Client-safe. Crawler tokens checked against the vendors' own docs on 2026-11-19:
// developers.openai.com/api/docs/bots, developers.google.com/search/docs/crawling-indexing/google-common-crawlers,
// docs.perplexity.ai/guides/bots, support.claude.com (article 8896518), commoncrawl.org/ccbot,
// support.apple.com/en-us/119829.
import { isLocale, LOCALE_NAMES, pageHref } from "../i18n";
import type { Project } from "../types";
import { pageContent } from "./content";

// Bots that answer users / power AI search: always allowed (they bring visitors).
export const AI_ANSWER_BOTS = [
  { token: "OAI-SearchBot", owner: "OpenAI", use: "ChatGPT search results" },
  { token: "ChatGPT-User", owner: "OpenAI", use: "Visits a page when a ChatGPT user asks (may ignore robots.txt)" },
  { token: "PerplexityBot", owner: "Perplexity", use: "Perplexity search results (not model training)" },
  { token: "Perplexity-User", owner: "Perplexity", use: "Visits a page when a user asks (generally ignores robots.txt)" },
  { token: "Claude-SearchBot", owner: "Anthropic", use: "Claude search results" },
  { token: "Claude-User", owner: "Anthropic", use: "Visits a page when a Claude user asks" },
] as const;
// Bots / tokens that only collect training data: blocked when "Block AI training" is on.
export const AI_TRAINING_BOTS = [
  { token: "GPTBot", owner: "OpenAI", use: "Training OpenAI models" },
  { token: "ClaudeBot", owner: "Anthropic", use: "Training Anthropic models" },
  { token: "Google-Extended", owner: "Google", use: "Gemini training and grounding (does not affect Google Search)" },
  { token: "Applebot-Extended", owner: "Apple", use: "Training Apple models (no own crawling)" },
  { token: "CCBot", owner: "Common Crawl", use: "Open web archive used to train many models" },
] as const;

// robots.txt groups for one website path prefix.
export function aiRobotsRules(project: Pick<Project, "seo">, prefix: string) {
  const lines = [`# AI answer and search bots: allowed`];
  for (const bot of AI_ANSWER_BOTS) lines.push(`User-agent: ${bot.token}`);
  lines.push(`Allow: ${prefix}`, "");
  if (project.seo?.blockAiTraining) {
    lines.push("# AI training-only crawlers: blocked (Settings → SEO)");
    for (const bot of AI_TRAINING_BOTS) lines.push(`User-agent: ${bot.token}`);
    lines.push(`Disallow: ${prefix}`, "");
  }
  return lines.join("\n");
}

const one = (value: string) => value.replace(/\s+/g, " ").trim();
// llms.txt: the website in a few lines + every published, indexable page grouped by language.
// full = llms-full.txt: the readable text of every page.
export function llmsText(project: Project, siteKey: string, absolute: (p: string) => string, full = false) {
  const pages = project.pages.filter((p) => !p.seo.noindex);
  const home = pages.find((p) => p.id === project.layout.homePageId);
  const b = project.seo?.business;
  const out: string[] = [`# ${b?.name || project.brand.name}`, ""];
  const summary = one(b?.description || home?.seo.description || "");
  if (summary) out.push(`> ${summary}`, "");
  const facts = [
    b?.legalName ? `Company: ${one(b.legalName)}` : "",
    b?.street || project.website?.address ? `Address: ${[b?.street || project.website?.address, b?.city, b?.postalCode, b?.country].filter(Boolean).join(", ")}` : "",
    b?.phone || project.website?.phone ? `Phone: ${b?.phone || project.website?.phone}` : "",
    b?.email || project.website?.contactEmail ? `E-mail: ${b?.email || project.website?.contactEmail}` : "",
    b?.hours ? `Opening hours: ${b.hours.split("\n").map(one).filter(Boolean).join("; ")}` : "",
  ].filter(Boolean);
  if (facts.length) out.push(...facts.map((f) => `- ${f}`), "");
  const locales = [...new Set(pages.map((p) => p.locale))];
  const ordered = project.languages
    ? [project.languages.default, ...locales.filter((l) => l !== project.languages!.default)]
    : locales;
  for (const locale of ordered) {
    const list = pages.filter((p) => p.locale === locale);
    if (!list.length) continue;
    if (ordered.length > 1 || !full)
      out.push(`## ${ordered.length > 1 ? (isLocale(locale) ? LOCALE_NAMES[locale] : locale) : "Pages"}`, "");
    for (const page of list) {
      const url = absolute(pageHref(project, siteKey, page));
      const title = one(page.seo.title || page.title);
      if (!full) {
        out.push(`- [${title}](${url})${page.seo.description ? `: ${one(page.seo.description)}` : ""}`);
        continue;
      }
      out.push(`### ${title}`, `URL: ${url}`, `Updated: ${page.updatedAt.slice(0, 10)}`, "");
      if (page.seo.description) out.push(one(page.seo.description), "");
      for (const line of pageContent(page.sections).outline)
        out.push(line.replace(/^#+/, (m) => "#".repeat(Math.min(m.length + 2, 6))));
      out.push("");
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
