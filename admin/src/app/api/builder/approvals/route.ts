import { after } from "next/server";
import { z } from "zod";
import { errorResponse, readJson, StoreError } from "@/lib/builder/server";
import { crmAccess } from "@/lib/builder/crm/access";
import { adminBase } from "@/lib/builder/approvals/hooks";
import {
  decide,
  dispatch,
  overview,
  pollOnce,
  revise,
  saveSettings,
  setWebhook,
  stopPolling,
} from "@/lib/builder/approvals/service";
import { CHAT_PATTERN } from "@/lib/builder/crm/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

// Approvals of the selected website (BUILDER.md → Approvals): the super admin and the
// website's clients (the business owner). Designers: 403, like the CRM.
// GET → overview (items, settings, Telegram state; webhook URL + test outbox for the super admin)
// POST {action: "approve"|"skip", id} | {action: "revise", id, instruction}
//      {action: "settings", revision, ...} | {action: "telegram", mode, pollerId?}
export async function GET(request: Request) {
  try {
    const { site, identity } = await crmAccess(request);
    after(() => dispatch(site.id).catch(() => 0));
    return json(await overview(site.id, identity.role === "super-admin", adminBase(request)));
  } catch (e) {
    return errorResponse(e);
  }
}

const id = z.string().uuid();
const hour = z.number().int().min(0).max(23);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["approve", "skip"]), id }).strict(),
  z.object({ action: z.literal("revise"), id, instruction: z.string().trim().min(2).max(2000) }).strict(),
  z
    .object({
      action: z.literal("settings"),
      revision: z.number().int().min(0),
      telegram: z.boolean().optional(),
      delivery: z.enum(["instant", "daily"]).optional(),
      digestHour: hour.optional(),
      quiet: z.boolean().optional(),
      quietFrom: hour.optional(),
      quietTo: hour.optional(),
      autoSocial: z.boolean().optional(),
      extraChats: z.array(z.string().regex(CHAT_PATTERN)).max(5).optional(),
      testMode: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("telegram"),
      mode: z.enum(["webhook-on", "webhook-off", "poll", "stop-poll", "dispatch"]),
      pollerId: z.string().regex(/^[\w-]{8,64}$/).optional(),
      wait: z.number().int().min(0).max(25).optional(),
    })
    .strict(),
]);

export async function POST(request: Request) {
  try {
    const { site, identity } = await crmAccess(request);
    const body = input.safeParse(await readJson(request, 32 * 1024));
    if (!body.success) throw new StoreError(body.error.issues[0]?.message || "Invalid request.");
    const data = body.data;
    const by = identity.name || identity.email || "Owner";
    const isOwner = identity.role === "super-admin";
    if (data.action === "approve" || data.action === "skip")
      return json({ item: await decide(site.id, data.id, data.action, by, identity.role) });
    if (data.action === "revise")
      return json({ item: await revise(site.id, data.id, data.instruction, by, identity.role) });
    if (data.action === "settings") {
      const { action: _a, ...patch } = data;
      void _a;
      const settings = await saveSettings(site.id, patch, isOwner);
      after(() => dispatch(site.id).catch(() => 0));
      return json({ settings });
    }
    // Telegram connection: webhook / polling are the administrator's job.
    if (data.action !== "telegram") throw new StoreError("Invalid request.");
    if (data.mode === "dispatch") return json({ sent: await dispatch(site.id) });
    if (!isOwner) throw new StoreError("Only the administrator can change the Telegram connection.", 403);
    if (data.mode === "webhook-on" || data.mode === "webhook-off")
      return json({ webhook: await setWebhook(site.id, adminBase(request), data.mode === "webhook-on") });
    if (!data.pollerId) throw new StoreError("pollerId is required.");
    if (data.mode === "stop-poll") {
      await stopPolling(site.id, data.pollerId);
      return json({ stopped: true });
    }
    return json(await pollOnce(site.id, data.pollerId, data.wait ?? 20));
  } catch (e) {
    return errorResponse(e);
  }
}
