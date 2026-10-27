import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
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
export function createSession(now = Date.now()) {
  if (!key()) throw new Error("Authentication is not configured.");
  const payload = Buffer.from(
    JSON.stringify({
      email: process.env.CMS_ADMIN_EMAIL || "",
      exp: Math.floor(now / 1000) + sessionLifetime,
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", key()).update(payload).digest("base64url")}`;
}
export function verifySession(token: string | undefined, now = Date.now()) {
  try {
    if (
      !token ||
      !key() ||
      (process.env.NODE_ENV === "production" && !authConfigured())
    )
      return false;
    const [payload, sig, ...rest] = token.split(".");
    if (rest.length || !sig) return false;
    const expected = createHmac("sha256", key())
      .update(payload)
      .digest("base64url");
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return false;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (
      value.email === (process.env.CMS_ADMIN_EMAIL || "") &&
      typeof value.exp === "number" &&
      value.exp > now / 1000 &&
      value.exp <= now / 1000 + sessionLifetime + 1
    );
  } catch {
    return false;
  }
}
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
