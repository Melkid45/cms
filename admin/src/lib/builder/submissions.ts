import "server-only";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { database, dataDirectory, StoreError } from "./server";
export type Submission = {
  id: string;
  createdAt: string;
  pageId: string;
  pageTitle: string;
  sectionId: string;
  values: Record<string, string>;
  read: boolean;
  delivery: "received" | "sent" | "failed";
};
type Inbox = {
  items: Submission[];
  limits: Record<string, { count: number; until: number }>;
};
const globalInbox = globalThis as typeof globalThis & {
  inboxQueue?: Promise<unknown>;
};
async function inbox<T>(
  update: (data: Inbox) => T | Promise<T>,
  write = true,
): Promise<T> {
  const sql = await database();
  const initial: Inbox = { items: [], limits: {} };
  if (sql)
    return (await sql.begin(async (tx) => {
      await tx`INSERT INTO harbstone_project(id,document) VALUES ('submissions',${tx.json(initial)}) ON CONFLICT DO NOTHING`;
      const [row] =
        await tx`SELECT document FROM harbstone_project WHERE id='submissions' FOR UPDATE`;
      const result = await update(row.document);
      if (write)
        await tx`UPDATE harbstone_project SET document=${tx.json(row.document)} WHERE id='submissions'`;
      return result;
    })) as T;
  if (process.env.VERCEL)
    throw new StoreError("Form storage is not configured.", 503);
  const operation = (globalInbox.inboxQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const file = path.join(dataDirectory, "submissions.json");
      let data: Inbox;
      try {
        data = JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        data = initial;
      }
      const result = await update(data);
      if (write) {
        await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
        await writeFile(file + ".tmp", JSON.stringify(data), { mode: 0o600 });
        await rename(file + ".tmp", file);
      }
      return result;
    });
  globalInbox.inboxQueue = operation;
  return operation;
}
export const listSubmissions = () => inbox((data) => data.items, false);
export const markSubmission = (id: string, read: boolean) =>
  inbox((data) => {
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new StoreError("Message not found.", 404);
    item.read = read;
    return item;
  });
function key() {
  const secret = process.env.CMS_AUTH_SECRET || process.env.CMS_ADMIN_PASSWORD;
  if (!secret && process.env.NODE_ENV !== "development")
    throw new StoreError(
      "Configure CMS_AUTH_SECRET before enabling forms.",
      503,
    );
  return secret || "harbstone-local-development-only";
}
function signature(value: string) {
  return createHmac("sha256", key()).update(value).digest("base64url");
}
export function formToken(pageId: string) {
  const data = Buffer.from(
    JSON.stringify({ pageId, time: Date.now(), nonce: randomUUID() }),
  ).toString("base64url");
  return `${data}.${signature(data)}`;
}
export function validateFormToken(token: string, pageId: string) {
  try {
    const [data, sig, ...rest] = token.split(".");
    if (rest.length) return false;
    const expected = signature(data);
    if (
      !sig ||
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return false;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    const age = Date.now() - payload.time;
    return payload.pageId === pageId && age >= 1000 && age < 30 * 60000;
  } catch {
    return false;
  }
}
export function smtpReady() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM &&
    (!process.env.SMTP_USER || process.env.SMTP_PASSWORD)
  );
}
export async function receiveSubmission(
  input: Omit<Submission, "id" | "createdAt" | "read" | "delivery">,
  ip: string,
  recipient: string,
) {
  const item: Submission = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    read: false,
    delivery: "received",
  };
  await inbox((data) => {
    consumeLimit(data, "form:" + ip, 5, 10 * 60000);
    if (data.items.length >= 5000)
      throw new StoreError(
        "The enquiry inbox is full. Please contact us directly.",
        503,
      );
    data.items.unshift(item);
  });
  if (smtpReady() && recipient) {
    try {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        requireTLS:
          process.env.SMTP_SECURE !== "true" && !!process.env.SMTP_USER,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
        connectionTimeout: 10000,
        socketTimeout: 15000,
      });
      const email = Object.values(item.values).find((v) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      );
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: recipient,
        replyTo: email,
        subject: `Website enquiry: ${item.pageTitle.replace(/[\r\n]/g, " ").slice(0, 150)}`,
        text: Object.entries(item.values)
          .map(([name, value]) => `${name}: ${value}`)
          .join("\n\n"),
      });
      item.delivery = "sent";
    } catch {
      item.delivery = "failed";
    }
    await inbox((data) => {
      const saved = data.items.find((i) => i.id === item.id);
      if (saved) saved.delivery = item.delivery;
    });
  }
  return item;
}
function consumeLimit(
  data: Inbox,
  scope: string,
  max: number,
  duration: number,
) {
  const now = Date.now();
  for (const [id, limit] of Object.entries(data.limits))
    if (limit.until < now) delete data.limits[id];
  const hash = createHash("sha256")
    .update(key() + scope)
    .digest("hex");
  const limit = data.limits[hash] ?? { count: 0, until: now + duration };
  if (limit.count >= max)
    throw new StoreError("Too many attempts. Please try again later.", 429);
  if (!data.limits[hash] && Object.keys(data.limits).length >= 10000)
    throw new StoreError("Please try again later.", 429);
  limit.count++;
  data.limits[hash] = limit;
}
export async function limitSignIn(ip: string) {
  return inbox((data) => consumeLimit(data, "signin:" + ip, 10, 15 * 60000));
}
