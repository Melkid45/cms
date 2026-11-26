import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { withDoc } from "./doc-store";
import { readProject, StoreError } from "./server";
import { definition } from "./catalog";
import { collectionItems } from "./collections";
import type { Project } from "./types";
import { listShopOrders, type ShopOrder } from "./shop";

// Customer accounts of a shop website (the buyers, not the CMS team). One document per
// website: `customers:{siteId}` with its own random signing secret, so a customer session
// can never be read as a CMS session (different cookie, different key, different store).
// Passwords: scrypt with a per-user salt; compared in constant time; never stored plain.
export interface Customer {
  id: string;
  email: string;
  name: string;
  surname: string;
  phone: string;
  salt: string;
  hash: string;
  createdAt: string;
  // Demo account of a preview website (seeded by its build script).
  demo?: boolean;
}
type Limit = { count: number; until: number };
type CustomersDoc = {
  secret: string;
  users: Customer[];
  limits: Record<string, Limit>;
};
const docId = (siteId: string) => `customers:${siteId}`;
const empty = (): CustomersDoc => ({
  secret: randomBytes(32).toString("base64url"),
  users: [],
  limits: {},
});
export const customerCookie = (siteId: string) => `site_customer_${siteId}`;
export const CUSTOMER_COOKIE_PATH = "/api/shop/account";
const SESSION_DAYS = 30;
const hashPassword = (password: string, salt: string) =>
  new Promise<string>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) =>
      error ? reject(error) : resolve(key.toString("base64url")),
    ),
  );
const sameText = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export const normEmail = (email: string) => email.trim().toLowerCase();
const digits = (s: string) => s.replace(/\D/g, "");
export const publicCustomer = (u: Customer) => ({
  email: u.email,
  name: u.name,
  surname: u.surname,
  phone: u.phone,
  demo: !!u.demo,
});

// Per-IP limits (hashed with the store secret), e.g. 10 sign-ins per 15 minutes.
export async function limitCustomer(
  siteId: string,
  scope: string,
  ip: string,
  max: number,
  minutes: number,
) {
  await withDoc(docId(siteId), empty, (data) => {
    const now = Date.now();
    for (const [k, v] of Object.entries(data.limits))
      if (v.until < now) delete data.limits[k];
    const key = createHash("sha256")
      .update(`${data.secret}:${scope}:${ip}`)
      .digest("base64url");
    const limit = data.limits[key] ?? { count: 0, until: now + minutes * 60000 };
    if (limit.count >= max)
      throw new StoreError("Too many attempts. Please try again later.", 429);
    if (!data.limits[key] && Object.keys(data.limits).length >= 10000)
      throw new StoreError("Please try again later.", 429);
    limit.count++;
    data.limits[key] = limit;
  });
}

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
async function session(siteId: string, userId: string) {
  const secret = await withDoc(docId(siteId), empty, (d) => d.secret);
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = `${userId}.${exp}`;
  return { value: `${payload}.${sign(secret, payload)}`, maxAge: SESSION_DAYS * 86400 };
}
// Reads the customer from the cookie value; null when missing, expired or forged.
export async function customerFromCookie(siteId: string, value?: string) {
  if (!value || value.length > 300) return null;
  const [userId, exp, sig] = value.split(".");
  if (!userId || !exp || !sig || Number(exp) < Date.now()) return null;
  return withDoc(
    docId(siteId),
    empty,
    (data) => {
      if (!sameText(sig, sign(data.secret, `${userId}.${exp}`))) return null;
      return data.users.find((u) => u.id === userId) || null;
    },
    false,
  );
}
export async function registerCustomer(
  siteId: string,
  input: { email: string; name: string; phone: string; password: string },
) {
  const email = normEmail(input.email);
  const salt = randomBytes(16).toString("base64url");
  const hash = await hashPassword(input.password, salt);
  const user = await withDoc(docId(siteId), empty, (data) => {
    if (data.users.some((u) => u.email === email))
      throw new StoreError("An account with this e-mail exists — sign in.", 409);
    if (data.users.length >= 20000)
      throw new StoreError("Registration is not available right now.", 503);
    const [name, ...rest] = input.name.trim().split(/\s+/);
    const u: Customer = {
      id: randomUUID(),
      email,
      name: name || "",
      surname: rest.join(" "),
      phone: input.phone.trim(),
      salt,
      hash,
      createdAt: new Date().toISOString(),
    };
    data.users.push(u);
    return u;
  });
  return { user, cookie: await session(siteId, user.id) };
}
// Same error for an unknown login and a wrong password. The login is an e-mail or a phone.
export async function signInCustomer(
  siteId: string,
  login: string,
  password: string,
) {
  const key = login.includes("@") ? normEmail(login) : digits(login);
  const user = await withDoc(
    docId(siteId),
    empty,
    (data) =>
      data.users.find((u) =>
        login.includes("@") ? u.email === key : key.length >= 6 && digits(u.phone).endsWith(key),
      ) || null,
    false,
  );
  // Hash anyway, so unknown logins take as long as wrong passwords.
  const hash = await hashPassword(password, user?.salt || "no-user-salt");
  if (!user || !sameText(hash, user.hash))
    throw new StoreError("Wrong login or password.", 401);
  return { user, cookie: await session(siteId, user.id) };
}
export async function updateCustomer(
  siteId: string,
  userId: string,
  patch: { name: string; surname: string; phone: string },
) {
  return withDoc(docId(siteId), empty, (data) => {
    const u = data.users.find((x) => x.id === userId);
    if (!u) throw new StoreError("Please sign in again.", 401);
    u.name = patch.name.trim();
    u.surname = patch.surname.trim();
    u.phone = patch.phone.trim();
    return u;
  });
}
export async function changeCustomerPassword(
  siteId: string,
  userId: string,
  current: string,
  next: string,
) {
  const user = await withDoc(docId(siteId), empty, (d) => d.users.find((u) => u.id === userId) || null, false);
  if (!user) throw new StoreError("Please sign in again.", 401);
  if (!sameText(await hashPassword(current, user.salt), user.hash))
    throw new StoreError("The current password is wrong.", 403);
  const salt = randomBytes(16).toString("base64url");
  const hash = await hashPassword(next, salt);
  await withDoc(docId(siteId), empty, (data) => {
    const u = data.users.find((x) => x.id === userId);
    if (!u) throw new StoreError("Please sign in again.", 401);
    u.salt = salt;
    u.hash = hash;
  });
}
// Creates or resets a demo account (build scripts of preview websites only).
export async function seedDemoCustomer(
  siteId: string,
  input: { email: string; name: string; surname: string; phone: string; password: string },
) {
  const email = normEmail(input.email);
  const salt = randomBytes(16).toString("base64url");
  const hash = await hashPassword(input.password, salt);
  return withDoc(docId(siteId), empty, (data) => {
    data.users = data.users.filter((u) => u.email !== email);
    const u: Customer = { id: randomUUID(), email, name: input.name, surname: input.surname, phone: input.phone, salt, hash, createdAt: new Date().toISOString(), demo: true };
    data.users.push(u);
    return publicCustomer(u);
  });
}

// Photo of an ordered item: the card photo (shop grids), else the first image of its section
// (product page, configurator). Only published content.
function itemImage(project: Project, item: ShopOrder["items"][number]) {
  const section = project.pages
    .find((p) => p.id === item.pageId && p.published)
    ?.published!.sections.find((s) => s.id === item.sectionId);
  const def = section && definition(section.variant);
  if (!section || !def) return "";
  const group = def.repeaters?.[0];
  if (item.kind === "card" && group)
    for (const c of collectionItems(section, def, group)) {
      const f = group.items[c.template]?.fields || [];
      if (String(c.values[f[5]] ?? "").trim() === item.name) return String(c.values[f[1]] ?? "");
    }
  const field = def.fields.find((f) => f.type === "image" && section.values[f.key]);
  return field ? String(section.values[field.key]) : "";
}
// What a buyer may see of an order (no internal note, no e-mail delivery state).
export const customerOrder = (o: ShopOrder, project?: Project) => ({
  number: o.number,
  createdAt: o.createdAt,
  status: o.status,
  history: o.history,
  currency: o.currency,
  items: o.items.map((i) => ({ name: i.name, options: i.options, qty: i.qty, unitPrice: i.unitPrice, total: i.total, kind: i.kind, image: project ? itemImage(project, i) : "" })),
  subtotal: o.subtotal,
  total: o.total ?? o.subtotal,
  delivery: o.delivery,
  customer: o.customer,
  comment: o.comment,
});
export async function customerOrders(siteId: string, email: string) {
  const key = normEmail(email);
  const project = await readProject(siteId);
  return (await listShopOrders(siteId))
    .filter((o) => normEmail(o.customer.email || "") === key)
    .map((o) => customerOrder(o, project));
}
// Guest lookup: the order number plus the e-mail or the phone of that order.
export async function findGuestOrder(siteId: string, number: number, contact: string) {
  const order = (await listShopOrders(siteId)).find((o) => o.number === number);
  const c = contact.trim();
  const ok =
    !!order &&
    (c.includes("@")
      ? !!order.customer.email && normEmail(order.customer.email) === normEmail(c)
      : digits(c).length >= 6 && digits(order.customer.phone).endsWith(digits(c)));
  if (!order || !ok)
    throw new StoreError("Order not found — check the number and the e-mail or phone.", 404);
  return customerOrder(order, await readProject(siteId));
}
