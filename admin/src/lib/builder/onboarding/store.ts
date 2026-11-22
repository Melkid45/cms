import "server-only";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { withDoc } from "../doc-store";
import { authorizeWrite, StoreError } from "../server";
import { canAccessSite, type Identity } from "../access";
import { readRegistry } from "../sites";
import { readClientOrder } from "../orders";
import { aiComplete, aiEnabled } from "../ai";
import type { Onboarding } from "./shared";

// All onboarding records of the installation in one locked document (`onboarding`,
// Postgres row or .data/onboarding.json). Records are small (chat + review history).
type Store = { items: Onboarding[] };
export const onboardingStore = <T>(fn: (data: Store) => T | Promise<T>, write = true) =>
  withDoc<Store, T>("onboarding", () => ({ items: [] }), fn, write);

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hash(token) };
};
export const findRecord = (data: Store, id: string) => {
  const record = data.items.find((item) => item.id === id);
  if (!record) throw new StoreError("Onboarding not found.", 404);
  return record;
};
export const readRecord = (id: string) => onboardingStore((data) => findRecord(data, id), false);
// Changes one record inside the lock; the callback may throw to cancel.
export const changeRecord = <T>(id: string, fn: (record: Onboarding) => T | Promise<T>) =>
  onboardingStore(async (data) => {
    const record = findRecord(data, id);
    const result = await fn(record);
    record.updatedAt = new Date().toISOString();
    return result;
  });
export const logEvent = (record: Onboarding, text: string, by: string) => {
  record.events.push({ at: new Date().toISOString(), text, by });
  if (record.events.length > 200) record.events = record.events.slice(-200);
};

export type Actor =
  | { kind: "customer"; name: string }
  | { kind: "team" | "client"; name: string; identity: Identity };
// The client opens their onboarding with its private link (#t=…) or the link of their
// website order; the team and the website's client accounts use their CMS session.
export async function authorizeOnboarding(request: Request, id: string) {
  const record = await readRecord(id);
  const token = request.headers.get("x-onboarding-token");
  if (token) {
    const expected = Buffer.from(record.tokenHash, "hex");
    const actual = Buffer.from(hash(token), "hex");
    if (timingSafeEqual(expected, actual)) return { record, actor: { kind: "customer", name: "client" } as Actor };
    if (record.orderId) {
      const order = await readClientOrder(record.orderId, token).catch(() => null);
      if (order) return { record, actor: { kind: "customer", name: "client" } as Actor };
    }
    throw new StoreError("Onboarding not found.", 404);
  }
  const identity = await authorizeWrite(request);
  const site = (await readRegistry()).sites.find((item) => item.id === record.siteId);
  if (!site || !canAccessSite(identity, site)) throw new StoreError("Onboarding not found.", 404);
  const actor: Actor = {
    kind: identity.role === "client" ? "client" : "team",
    name: identity.name || identity.email,
    identity,
  };
  return { record, actor };
}

// Per-record safety caps on top of the monthly budget in ai.ts.
const MAX_CALLS = 120;
const MAX_COST = 0.5;
// Paid AI through lib/builder/ai.ts with the cost logged on the record. Test records
// (record.mock, set by the super admin only) get the canned answer: no network, no cost.
export async function recordAi(
  id: string,
  purpose: string,
  input: { system: string; user: string; maxTokens?: number; json?: boolean; mock: () => string },
) {
  const record = await readRecord(id);
  if (!record.mock && !aiEnabled()) throw new StoreError("AI is switched off on this server.", 503);
  if (!record.mock && (record.ai.calls >= MAX_CALLS || record.ai.cost >= MAX_COST))
    throw new StoreError("The AI limit for this website is reached. Ask the team to continue.", 429);
  const ask = () =>
    aiComplete({
      system: input.system,
      user: input.user,
      maxTokens: input.maxTokens,
      json: input.json,
      useMock: record.mock,
      mock: record.mock ? input.mock() : undefined,
    });
  let result = await ask();
  await logAi(id, purpose, result);
  // A JSON answer that cannot be read (cut off, broken quoting) is asked for once more.
  if (input.json && !readable(result.text)) {
    result = await ask();
    await logAi(id, purpose + " (retry)", result);
  }
  return result;
}
export async function logAi(
  id: string,
  purpose: string,
  result: { cost: number; model: string; tokensIn: number; tokensOut: number },
) {
  await changeRecord(id, (record) => {
    record.ai.calls += 1;
    record.ai.cost = Math.round((record.ai.cost + result.cost) * 1e6) / 1e6;
    record.ai.log.push({ at: new Date().toISOString(), purpose, ...result });
    if (record.ai.log.length > 300) record.ai.log = record.ai.log.slice(-300);
  });
}
const readable = (text: string) => {
  try {
    parseJson(text);
    return true;
  } catch {
    return false;
  }
};
// Parses a JSON answer; models sometimes wrap it in a code fence.
export function parseJson<T>(text: string): T {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(clean) as T;
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    try {
      if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1)) as T;
    } catch {
      // fall through
    }
    throw new StoreError("The AI answer could not be read. Please try again.", 502);
  }
}
export const newId = () => randomUUID();
