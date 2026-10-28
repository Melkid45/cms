import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { z } from "zod";
import { database, dataDirectory, StoreError } from "./server";
const fields = {
  source: z.enum(["hosting", "custom", "disabled"]),
  host: z
    .string()
    .trim()
    .max(253)
    .regex(/^$|^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i),
  port: z.union([z.literal(465), z.literal(587)]),
  username: z.string().trim().max(254),
  fromEmail: z.union([z.literal(""), z.email()]),
  fromName: z
    .string()
    .max(100)
    .refine((s) => !/[\r\n]/.test(s)),
  replyTo: z.union([z.literal(""), z.email()]),
};
export const smtpInput = z
  .object({
    ...fields,
    revision: z.number().int().nonnegative(),
    password: z.string().max(1000).optional(),
  })
  .strict();
type Settings = z.infer<typeof smtpInput>;
type Stored = Omit<Settings, "password"> & { encryptedPassword: string };
const initial: Stored = {
  revision: 0,
  source: "hosting",
  host: "",
  port: 587,
  username: "",
  fromEmail: "",
  fromName: "",
  replyTo: "",
  encryptedPassword: "",
};
const globalSmtp = globalThis as typeof globalThis & {
  smtpQueue?: Promise<unknown>;
};
async function storage<T>(
  fn: (data: Stored) => T | Promise<T>,
  write = false,
): Promise<T> {
  const sql = await database();
  if (sql)
    return (await sql.begin(async (tx) => {
      await tx`INSERT INTO harbstone_project(id,document) VALUES ('smtp',${tx.json(initial)}) ON CONFLICT DO NOTHING`;
      const [row] =
        await tx`SELECT document FROM harbstone_project WHERE id='smtp' FOR UPDATE`;
      const result = await fn(row.document);
      if (write)
        await tx`UPDATE harbstone_project SET document=${tx.json(row.document)} WHERE id='smtp'`;
      return result;
    })) as T;
  if (process.env.VERCEL)
    throw new StoreError("Email settings storage is not configured.", 503);
  const operation = (globalSmtp.smtpQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const file = path.join(dataDirectory, "smtp.json");
      let data: Stored;
      try {
        data = JSON.parse(await readFile(file, "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        data = { ...initial };
      }
      const result = await fn(data);
      if (write) {
        await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
        await writeFile(file + ".tmp", JSON.stringify(data), { mode: 0o600 });
        await rename(file + ".tmp", file);
      }
      return result;
    });
  globalSmtp.smtpQueue = operation;
  return operation;
}
function key() {
  const secret = process.env.CMS_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV !== "development")
    throw new StoreError(
      "Configure the authentication secret before saving SMTP credentials.",
      503,
    );
  return createHash("sha256")
    .update("harbstone:smtp:v1:" + (secret || "local-development-only"))
    .digest();
}
function encrypt(password: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const bytes = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((b) => b.toString("base64url"))
    .join(".");
}
function decrypt(value: string) {
  const [iv, tag, bytes] = value
    .split(".")
    .map((s) => Buffer.from(s, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(bytes), cipher.final()]).toString("utf8");
}
const hostingReady = () =>
  !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM &&
    (!process.env.SMTP_USER || process.env.SMTP_PASSWORD)
  );
function publicSettings(data: Stored) {
  const { encryptedPassword, ...settings } = data;
  return {
    ...settings,
    passwordConfigured: !!encryptedPassword,
    ready:
      data.source === "hosting"
        ? hostingReady()
        : data.source === "custom" &&
          !!(
            data.host &&
            data.fromEmail &&
            (!data.username || encryptedPassword)
          ),
  };
}
export const readSmtpSettings = () => storage(publicSettings);
export async function saveSmtpSettings(value: unknown) {
  const parsed = smtpInput.safeParse(value);
  if (!parsed.success)
    throw new StoreError(
      "Check the SMTP settings. Use port 465 (TLS) or 587 (STARTTLS).",
    );
  const { password, ...settings } = parsed.data;
  return storage((data) => {
    if (data.revision !== settings.revision)
      throw new StoreError(
        "Email settings have changed. Reload before saving.",
        409,
      );
    if (settings.source === "custom") {
      if (!settings.host || !settings.fromEmail)
        throw new StoreError("Enter the SMTP host and sender email.");
      if (
        settings.username &&
        !password &&
        (!data.encryptedPassword ||
          data.host !== settings.host ||
          data.username !== settings.username)
      )
        throw new StoreError(
          "Enter the password for this SMTP host and username.",
        );
    }
    Object.assign(data, settings, {
      revision: data.revision + 1,
      encryptedPassword: password ? encrypt(password) : data.encryptedPassword,
    });
    return publicSettings(data);
  }, true);
}
async function publicAddress(host: string) {
  const records = await lookup(host, { family: 4, all: true });
  if (!records.length)
    throw new StoreError("The SMTP host could not be resolved.");
  for (const { address } of records) {
    const [a, b, c] = address.split(".").map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    )
      throw new StoreError("Use a publicly reachable SMTP server.");
  }
  return records[0].address;
}
export async function mailConnection() {
  const config = await storage((data) => ({ ...data }));
  if (config.source === "disabled") return null;
  if (config.source === "hosting") {
    if (!hostingReady()) return null;
    return {
      transport: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        requireTLS:
          process.env.SMTP_SECURE !== "true" && !!process.env.SMTP_USER,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
      from: process.env.SMTP_FROM!,
      replyTo: "",
    };
  }
  if (!publicSettings(config).ready)
    throw new StoreError(
      "Complete the SMTP settings before testing the connection.",
    );
  const address = await publicAddress(config.host);
  return {
    transport: nodemailer.createTransport({
      host: address,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port === 587,
      tls: { servername: config.host, minVersion: "TLSv1.2" },
      auth: config.username
        ? { user: config.username, pass: decrypt(config.encryptedPassword) }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      disableFileAccess: true,
      disableUrlAccess: true,
    }),
    from: { name: config.fromName, address: config.fromEmail },
    replyTo: config.replyTo,
  };
}
export async function verifySmtp() {
  try {
    const connection = await mailConnection();
    if (!connection)
      throw new StoreError("Email delivery is disabled or not configured.");
    try {
      await connection.transport.verify();
    } finally {
      connection.transport.close();
    }
    return { ok: true, message: "Connection verified. No email was sent." };
  } catch (error) {
    if (error instanceof StoreError) throw error;
    throw new StoreError(
      "Could not connect. Check the SMTP host, TLS port and credentials.",
      400,
    );
  }
}
