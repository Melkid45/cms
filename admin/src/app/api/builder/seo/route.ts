import { z } from "zod";
import { errorResponse, readJson, readProject, StoreError } from "@/lib/builder/server";
import { authorizeSite } from "@/lib/builder/sites";
import { aiChecks, auditSite, entityChecks, scoreOf } from "@/lib/builder/seo/audit";
import { seoPack, setSeoPack } from "@/lib/builder/seo/pack";
import { suggestRedirects } from "@/lib/builder/seo/suggest";
import { AI_ANSWER_BOTS, AI_TRAINING_BOTS } from "@/lib/builder/seo/ai";
export const runtime = "nodejs";
const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });

// SEO overview of the selected website (design roles: SEO is not client-editable, ACCESS.md).
// Without the SEO pack only scores and check names are returned; details, fix links,
// AI readiness and redirect suggestions need the pack.
export async function GET(request: Request) {
  try {
    const { site, identity } = await authorizeSite(request, "design");
    const project = await readProject(site.id);
    const pack = await seoPack(site.id);
    const only = new URL(request.url).searchParams.get("page");
    const audits = auditSite(project, site.key).filter((a) => !only || a.pageId === only);
    const entity = entityChecks(project);
    const pages = audits.map((audit) => {
      const source = project.pages.find((p) => p.id === audit.pageId)!;
      const ai = pack
        ? aiChecks(audit, { ...(source.published ?? source), id: source.id }, audit.published)
        : [];
      const issues = audit.checks.filter((c) => c.status !== "ok").length;
      return {
        pageId: audit.pageId,
        title: audit.title,
        slug: audit.slug,
        locale: audit.locale,
        published: audit.published,
        noindex: audit.noindex,
        score: audit.score,
        issues,
        checks: pack
          ? audit.checks
          : audit.checks.map(({ id, label, status }) => ({ id, label, status, detail: "" })),
        ai: pack ? { score: scoreOf([...entity, ...ai]), checks: ai } : null,
      };
    });
    return json({
      site: { id: site.id, key: site.key, name: site.name },
      pack,
      canTogglePack: identity.role === "super-admin",
      score: pages.length ? Math.round(pages.reduce((s, p) => s + p.score, 0) / pages.length) : 0,
      entity: pack ? entity : null,
      bots: { answer: AI_ANSWER_BOTS, training: AI_TRAINING_BOTS },
      pages,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pack"), enabled: z.boolean() }),
  z.object({ action: z.literal("suggest"), urls: z.array(z.string().max(2000)).max(1000) }),
]);
// pack: switch the SEO pack (super admin). suggest: redirect suggestions for old URLs (pack).
export async function POST(request: Request) {
  try {
    const body = input.safeParse(await readJson(request, 512 * 1024));
    if (!body.success) throw new StoreError(body.error.issues[0]?.message || "Invalid request.");
    if (body.data.action === "pack") {
      const { site } = await authorizeSite(request, true);
      return json({ pack: await setSeoPack(site.id, body.data.enabled) });
    }
    const { site } = await authorizeSite(request, "design");
    if (!(await seoPack(site.id)))
      throw new StoreError("Redirect suggestions are part of the SEO pack.", 402);
    return json({ suggestions: suggestRedirects(await readProject(site.id), body.data.urls) });
  } catch (e) {
    return errorResponse(e);
  }
}
