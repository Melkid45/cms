import "server-only";
import { StoreError } from "../../server";
import { decide, readAssistant, revise } from "../../seo/assistant";
import { SUGGESTION_TYPES, type Suggestion } from "../../seo/assistant-shared";
import { registerApprovalProvider } from "../providers";
import { addHistory, approvalsStore, enqueue } from "../store";

// SEO suggestions of the AI SEO assistant (lib/builder/seo/assistant.ts, its own queue).
// sync() mirrors its pending suggestions here; Approve / Skip / Edit call the assistant's
// own decide() / revise(), so both queues always agree.

const label = (s: Suggestion) => SUGGESTION_TYPES[s.type]?.label ?? s.type;
export function suggestionText(s: Suggestion) {
  const lines = [s.reason.trim()];
  for (const c of s.changes.slice(0, 4)) {
    lines.push("");
    lines.push(`${c.label}:`);
    if (c.before.trim()) lines.push(`Now: ${c.before.trim().slice(0, 600)}`);
    lines.push(`New: ${c.after.trim().slice(0, 1200)}`);
  }
  if (!s.changes.length) lines.push("", "Advice only: approving marks it as done.");
  if (s.flags.length) lines.push("", `Check: ${s.flags.join("; ").slice(0, 400)}`);
  return lines.join("\n").trim();
}
const titleOf = (s: Suggestion) => `${label(s)} · ${s.pageTitle} (${s.locale.toUpperCase()})`;

registerApprovalProvider({
  type: "seo_suggestion",
  note: "From the AI SEO assistant (SEO → Assistant). Approve applies the change and publishes it when the assistant's “publish after approving” is on.",
  async sync(siteId) {
    const state = await readAssistant(siteId).catch(() => null);
    if (!state) return 0;
    const byId = new Map(state.suggestions.map((s) => [s.id, s]));
    // Decided in the SEO screen → close the mirrored item.
    await approvalsStore(siteId, (data) => {
      for (const item of data.items) {
        if (item.type !== "seo_suggestion" || !["pending", "revising"].includes(item.status)) continue;
        const s = byId.get(item.ref.suggestionId);
        if (!s || s.status === "pending") continue;
        item.status = s.status === "approved" ? "approved" : "skipped";
        item.result = `Decided in the SEO screen (${s.status}).`;
        addHistory(item, s.decidedBy || "SEO screen", item.result);
      }
    });
    let added = 0;
    for (const s of state.suggestions.filter((x) => x.status === "pending").slice(0, 200)) {
      const { created } = await enqueue(siteId, {
        type: "seo_suggestion",
        key: `seo:${s.id}`,
        title: titleOf(s),
        text: suggestionText(s),
        ref: { suggestionId: s.id, pageId: s.pageId },
        by: "SEO assistant",
      });
      if (created) added++;
    }
    return added;
  },
  async apply(item, ctx) {
    const state = await readAssistant(item.siteId);
    const result = await decide(
      item.siteId,
      { ids: [item.ref.suggestionId], action: "approve", publish: state.settings.publish },
      { name: ctx.by, role: ctx.role },
    );
    return "published" in result && result.published ? "Applied and published." : "Applied to the page draft.";
  },
  async skip(item, ctx) {
    await decide(item.siteId, { ids: [item.ref.suggestionId], action: "reject" }, { name: ctx.by, role: ctx.role });
    return "Rejected.";
  },
  async revise(item, instruction, ctx) {
    // The assistant's own revise (its test mode decides mock answers; its budget applies).
    const { suggestion, cost } = await revise(item.siteId, { id: item.ref.suggestionId, instruction }, { name: ctx.by });
    if (!suggestion) throw new StoreError("Suggestion not found.", 404);
    return { text: suggestionText(suggestion), cost };
  },
});
