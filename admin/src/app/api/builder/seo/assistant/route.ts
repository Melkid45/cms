import { z } from "zod";
import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { canDesign } from "@/lib/builder/access";
import { aiStatus } from "@/lib/builder/ai";
import { seoPack } from "@/lib/builder/seo/pack";
import { buildReport, decide, readAssistant, revise, runAssistant, sendReport, updateSettings } from "@/lib/builder/seo/assistant";
export const runtime = "nodejs";
export const maxDuration = 300;
const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });

// AI SEO assistant (BUILDER.md → AI SEO assistant). Every account with access to the website may
// read the queue; clients only when the website has the SEO pack.
// GET                       → { pack, canRun, canSettings, settings, ai, month, suggestions, runs }
// GET ?view=report&month=   → monthly report
// POST {action:"run", maxPages?, pageIds?, mock?}         design roles; super admin may force mock
// POST {action:"approve"|"reject"|"undo", ids, publish?, edits?}  design roles; clients with the pack
// POST {action:"revise", id, change?, instruction}        AI rewrite of a pending suggestion
// POST {action:"settings", ...}                           super admin
// POST {action:"send-report", month?}                     super admin
export async function GET(request: Request) {
  try {
    const { site, identity } = await authorizeSite(request);
    const pack = await seoPack(site.id);
    const design = canDesign(identity);
    if (!design && !pack) throw new StoreError("The SEO assistant is part of the SEO pack.", 402);
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "report") {
      const month = url.searchParams.get("month") || undefined;
      if (month && !/^\d{4}-\d{2}$/.test(month)) throw new StoreError("Invalid month.");
      return json({ report: await buildReport(site.id, site.key, month) });
    }
    const doc = await readAssistant(site.id);
    const now = new Date().toISOString().slice(0, 7);
    const ai = await aiStatus();
    return json({
      site: { id: site.id, key: site.key, name: site.name },
      pack,
      role: identity.role,
      canRun: design && pack,
      canSettings: identity.role === "super-admin",
      settings: doc.settings,
      ai: { enabled: ai.enabled, model: ai.model },
      month: { id: now, cost: doc.months[now]?.cost ?? 0, calls: doc.months[now]?.calls ?? 0 },
      scores: doc.scores,
      suggestions: doc.suggestions.slice(0, 400),
      runs: doc.runs.slice(0, 12),
      reports: doc.reports,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const ids = z.array(z.string().max(80)).min(1).max(200);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run"), maxPages: z.number().int().min(1).max(60).optional(), pageIds: z.array(z.string().max(120)).max(60).optional(), mock: z.boolean().optional() }),
  z.object({
    action: z.enum(["approve", "reject", "undo"]),
    ids,
    publish: z.boolean().optional(),
    edits: z.record(z.string().max(80), z.record(z.string().max(4), z.string().max(8000))).optional(),
  }),
  z.object({ action: z.literal("revise"), id: z.string().max(80), change: z.number().int().min(0).max(50).optional(), instruction: z.string().trim().min(2).max(500) }),
  z.object({
    action: z.literal("settings"),
    monthly: z.boolean().optional(),
    budgetUsd: z.number().min(0).max(20).optional(),
    maxPages: z.number().int().min(1).max(60).optional(),
    testMode: z.boolean().optional(),
    publish: z.boolean().optional(),
    report: z.boolean().optional(),
  }),
  z.object({ action: z.literal("send-report"), month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
]);

export async function POST(request: Request) {
  try {
    const body = input.safeParse(await readJson(request, 256 * 1024));
    if (!body.success) throw new StoreError(body.error.issues[0]?.message || "Invalid request.");
    const data = body.data;
    if (data.action === "settings" || data.action === "send-report") {
      const { site } = await authorizeSite(request, true);
      if (data.action === "send-report")
        return json({ results: await sendReport(site.id, await buildReport(site.id, site.key, data.month)) });
      const { action: _a, ...patch } = data;
      void _a;
      return json({ settings: await updateSettings(site.id, patch) });
    }
    if (data.action === "run") {
      const { site, identity } = await authorizeSite(request, "design");
      return json({
        run: await runAssistant(site.id, site.key, {
          by: identity.name || identity.email,
          trigger: "manual",
          mock: identity.role === "super-admin" ? data.mock : undefined,
          maxPages: data.maxPages,
          pageIds: data.pageIds,
        }),
      });
    }
    // approve / reject / undo / revise: design roles, or a client of this website (pack checked inside).
    const { site, identity } = await authorizeSite(request);
    const who = { name: identity.name || identity.email, role: identity.role };
    if (data.action === "revise") {
      if (!canDesign(identity) && !(await seoPack(site.id))) throw new StoreError("Needs the SEO pack.", 403);
      return json(await revise(site.id, data, who));
    }
    return json(await decide(site.id, data, who));
  } catch (e) {
    return errorResponse(e);
  }
}
