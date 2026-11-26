// Keep an attempt across retries/refreshes. Never store customer details in this record.
const memory = new Map<string, { hash: string; id: string; at: number }>();
const keyOf = (site: string, page: string) =>
  `cms-checkout-attempt:${site}:${page}`;
export async function checkoutBody(
  site: string,
  page: string,
  payload: Record<string, unknown>,
) {
  const { token: _, ...identity } = payload;
  void _;
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(identity)),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const key = keyOf(site, page);
  let prior = memory.get(key);
  try {
    prior = JSON.parse(sessionStorage.getItem(key) || "null") || prior;
  } catch {}
  const attempt =
    prior?.hash === hash && Date.now() - prior.at < 6 * 86400000
      ? prior
      : { hash, id: crypto.randomUUID(), at: Date.now() };
  memory.set(key, attempt);
  try {
    sessionStorage.setItem(key, JSON.stringify(attempt));
  } catch {}
  return JSON.stringify({ ...payload, requestId: attempt.id });
}
export function checkoutComplete(site: string, page: string) {
  memory.delete(keyOf(site, page));
  try {
    sessionStorage.removeItem(keyOf(site, page));
  } catch {}
}
