import "server-only";
import {
  approveReviewItem,
  listApprovalItems,
  reviseReviewItem,
  type ApprovalItem as ReviewApproval,
} from "../../onboarding/review";
import { registerApprovalProvider } from "../providers";
import { addHistory, approvalsStore, enqueue } from "../store";

// Onboarding review items: texts of a new website the owner checks block by block
// (lib/builder/onboarding/review.ts). sync() mirrors the pending blocks; Approve / Edit call
// the onboarding module's own approveReviewItem / reviseReviewItem (its record decides mock
// AI answers). Skip leaves the block pending in onboarding (nothing is called).

const textOf = (r: ReviewApproval) => {
  const lines = [r.preview.trim()];
  if (r.placeholders.length) lines.push("", `Still to fill in: ${r.placeholders.join(", ")}`);
  return lines.join("\n").trim();
};

registerApprovalProvider({
  type: "text_review",
  note: "Texts of a new website from onboarding (block by block). Approve accepts the block; Edit rewrites it with AI.",
  async sync(siteId) {
    const all = await listApprovalItems({ status: "all", siteId }).catch(() => null);
    if (!all) return 0;
    const byId = new Map(all.map((r) => [r.id, r]));
    // Decided in the onboarding screen → close the mirrored item.
    await approvalsStore(siteId, (data) => {
      for (const item of data.items) {
        if (item.type !== "text_review" || !["pending", "revising"].includes(item.status)) continue;
        const r = byId.get(item.ref.reviewId);
        if (r && r.status === "pending") continue;
        item.status = r?.status === "approved" ? "approved" : "skipped";
        item.result = r ? `Decided in onboarding (${r.status}).` : "The block no longer exists.";
        addHistory(item, "Onboarding", item.result);
      }
    });
    // Skipped here = stays skipped until onboarding has a newer version of that block.
    const skipped = await approvalsStore(
      siteId,
      (data) => new Map(data.items.filter((i) => i.type === "text_review" && i.status === "skipped").map((i) => [i.key, Number(i.ref.version) || 0])),
      false,
    );
    let added = 0;
    for (const r of all.filter((x) => x.status === "pending")) {
      const was = skipped.get(`onboarding:${r.id}`);
      if (was !== undefined && r.version <= was) continue;
      const { created } = await enqueue(siteId, {
        type: "text_review",
        key: `onboarding:${r.id}`,
        title: r.label,
        text: textOf(r),
        ref: { reviewId: r.id, onboardingId: r.onboardingId, pageId: r.pageId, version: String(r.version) },
        by: "Onboarding",
      });
      if (created) added++;
    }
    return added;
  },
  async apply(item, ctx) {
    await approveReviewItem(item.ref.reviewId, ctx.by);
    return "Text accepted.";
  },
  async skip() {
    return "Skipped here; the block stays open in onboarding.";
  },
  async revise(item, instruction, ctx) {
    const { item: next, cost, model } = await reviseReviewItem(item.ref.reviewId, instruction, ctx.by);
    return { text: textOf(next), title: next.label, cost, model };
  },
});
