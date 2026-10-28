import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { Identity } from "./permissions";
export const ownerIdentity = (): Identity => ({
  id: "owner",
  email: process.env.CMS_ADMIN_EMAIL || "",
  name: "Ilya Melman",
  role: "super-admin",
  version: 1,
});
const sessionLifetime = 12 * 60 * 60;
export function authConfigured() {
  return !!(
    process.env.CMS_ADMIN_EMAIL &&
    process.env.CMS_ADMIN_PASSWORD &&
    process.env.CMS_AUTH_SECRET &&
    process.env.CMS_AUTH_SECRET.length >= 32 &&
    process.env.CMS_ADMIN_PASSWORD.length >= 12
  );
}
export function localAccess() {
  return (
    process.env.NODE_ENV === "development" && !process.env.CMS_ADMIN_PASSWORD
  );
}
const developmentKey = randomBytes(32).toString("hex");
function key() {
  return (
    process.env.CMS_AUTH_SECRET ||
    (process.env.NODE_ENV === "development"
      ? process.env.CMS_ADMIN_PASSWORD || developmentKey
      : "")
  );
}
export function createSession(
  now = Date.now(),
  identity: Identity = ownerIdentity(),
) {
  if (!key()) throw new Error("Authentication is not configured.");
  const payload = Buffer.from(
    JSON.stringify({
      ...identity,
      exp: Math.floor(now / 1000) + sessionLifetime,
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", key()).update(payload).digest("base64url")}`;
}
export function sessionIdentity(
  token: string | undefined,
  now = Date.now(),
): Identity | null {
  try {
    if (
      !token ||
      !key() ||
      (process.env.NODE_ENV === "production" && !authConfigured())
    )
      return null;
    const [payload, sig, ...rest] = token.split(".");
    if (rest.length || !sig) return null;
    const expected = createHmac("sha256", key())
      .update(payload)
      .digest("base64url");
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    const valid =
      typeof value.exp === "number" &&
      value.exp > now / 1000 &&
      value.exp <= now / 1000 + sessionLifetime + 1;
    if (!valid) return null;
    // Existing owner sessions remain valid; client identities always carry a version.
    if (
      (!value.role || value.role === "super-admin") &&
      value.email === (process.env.CMS_ADMIN_EMAIL || "")
    )
      return ownerIdentity();
    if (
      value.role === "client" &&
      typeof value.id === "string" &&
      typeof value.email === "string" &&
      typeof value.name === "string" &&
      Number.isInteger(value.version)
    )
      return value;
    return null;
  } catch {
    return null;
  }
}
export const verifySession = (token: string | undefined, now = Date.now()) =>
  !!sessionIdentity(token, now);
export function credentialsMatch(email: unknown, password: unknown) {
  const equal = (a: string, b: string) => {
    const left = Buffer.from(a),
      right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };
  return (
    typeof email === "string" &&
    typeof password === "string" &&
    equal(
      email.trim().toLowerCase(),
      (process.env.CMS_ADMIN_EMAIL || "").toLowerCase(),
    ) &&
    equal(password, process.env.CMS_ADMIN_PASSWORD || "")
  );
}
