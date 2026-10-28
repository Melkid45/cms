import "server-only";
import {
  randomBytes,
  randomUUID,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { database, dataDirectory, StoreError } from "./server";
import type { Identity } from "./permissions";
const scrypt = promisify(derive);
interface Account extends Identity {
  hash: string;
  salt: string;
  disabled: boolean;
}
const store = globalThis as typeof globalThis & {
  accountQueue?: Promise<unknown>;
};
async function accounts<T>(
  fn: (items: Account[]) => T | Promise<T>,
  write = false,
): Promise<T> {
  const sql = await database();
  if (sql)
    return (await sql.begin(async (tx) => {
      await tx`INSERT INTO harbstone_project(id,document) VALUES ('accounts','[]'::jsonb) ON CONFLICT DO NOTHING`;
      const [row] =
        await tx`SELECT document FROM harbstone_project WHERE id='accounts' FOR UPDATE`;
      const result = await fn(row.document);
      if (write)
        await tx`UPDATE harbstone_project SET document=${tx.json(row.document)} WHERE id='accounts'`;
      return result;
    })) as T;
  if (process.env.VERCEL)
    throw new StoreError("Account storage is not configured.", 503);
  const operation = (store.accountQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const file = path.join(dataDirectory, "accounts.json");
      let items: Account[];
      try {
        items = JSON.parse(await readFile(file, "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        items = [];
      }
      const result = await fn(items);
      if (write) {
        await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
        await writeFile(file + ".tmp", JSON.stringify(items), { mode: 0o600 });
        await rename(file + ".tmp", file);
      }
      return result;
    });
  store.accountQueue = operation;
  return operation;
}
const publicAccount = ({
  id,
  email,
  name,
  role,
  version,
  disabled,
}: Account) => ({ id, email, name, role, version, disabled });
export const listAccounts = () => accounts((items) => items.map(publicAccount));
export const accountIdentity = (id: string, version: number) =>
  accounts((items) => {
    const item = items.find(
      (a) => a.id === id && a.version === version && !a.disabled,
    );
    return item ? publicAccount(item) : null;
  });
export async function accountLogin(email: unknown, password: unknown) {
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    password.length > 256
  )
    return null;
  const item = await accounts((items) =>
    items.find((a) => a.email === email.trim().toLowerCase()),
  );
  // Derive for unknown users too, to avoid a cheap account-existence timing signal.
  const hash = (await scrypt(
    password,
    item?.salt || "harbstone-unknown-account",
    64,
  )) as Buffer;
  if (
    !item ||
    item.disabled ||
    !timingSafeEqual(hash, Buffer.from(item.hash, "hex"))
  )
    return null;
  return publicAccount(item);
}
export async function saveAccount(input: {
  id?: string;
  name?: string;
  email?: string;
  password?: string;
  disabled?: boolean;
}) {
  const credentials = input.password
    ? { salt: randomBytes(24).toString("hex"), hash: "" }
    : undefined;
  if (credentials)
    credentials.hash = (
      (await scrypt(input.password!, credentials.salt, 64)) as Buffer
    ).toString("hex");
  return accounts((items) => {
    if (input.id) {
      const item = items.find((a) => a.id === input.id);
      if (!item) throw new StoreError("Account not found.", 404);
      if (credentials) Object.assign(item, credentials);
      if (input.disabled !== undefined) item.disabled = input.disabled;
      item.version++;
      return publicAccount(item);
    }
    const email = input.email!.trim().toLowerCase();
    if (
      email === process.env.CMS_ADMIN_EMAIL?.toLowerCase() ||
      items.some((a) => a.email === email)
    )
      throw new StoreError("This email already has an account.", 409);
    if (items.length >= 50) throw new StoreError("Account limit reached.");
    const item: Account = {
      id: randomUUID(),
      email,
      name: input.name!,
      role: "client",
      version: 1,
      disabled: false,
      ...credentials!,
    };
    items.push(item);
    return publicAccount(item);
  }, true);
}
