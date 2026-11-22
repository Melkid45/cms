import { z } from "zod";
import {
  assertSameOrigin,
  clientIp,
  errorResponse,
  readJson,
  StoreError,
} from "@/lib/builder/server";
import { readRegistry } from "@/lib/builder/sites";
import {
  changeCustomerPassword,
  CUSTOMER_COOKIE_PATH,
  customerCookie,
  customerFromCookie,
  customerOrders,
  findGuestOrder,
  limitCustomer,
  publicCustomer,
  registerCustomer,
  signInCustomer,
  updateCustomer,
} from "@/lib/builder/customers";
export const runtime = "nodejs";

// Customer accounts of a shop website (buyers): register, sign in, sign out, profile,
// password, own orders, and the guest "find my order" lookup. Separate from CMS sign-in:
// own cookie (site_customer_{site}, path /api/shop/account only, HttpOnly, SameSite=Lax),
// own signing secret, own store; it never grants any CMS access.
const site = z.string().regex(/^[a-z0-9]{1,40}$/);
const password = z.string().min(6).max(200);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), site, login: z.string().trim().min(3).max(254), password: z.string().max(200) }),
  z.object({
    action: z.literal("register"),
    site,
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[\d\s().-]{6,40}$/)]),
    password,
  }),
  z.object({ action: z.literal("logout"), site }),
  z.object({
    action: z.literal("profile"),
    site,
    name: z.string().trim().max(120),
    surname: z.string().trim().max(120),
    phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[\d\s().-]{6,40}$/)]),
  }),
  z.object({ action: z.literal("password"), site, current: z.string().max(200), next: password }),
  z.object({
    action: z.literal("lookup"),
    site,
    number: z.coerce.number().int().min(1).max(10000000),
    contact: z.string().trim().min(3).max(254),
  }),
]);
async function knownSite(id: string) {
  if (!(await readRegistry()).sites.some((s) => s.id === id))
    throw new StoreError("Not found.", 404);
}
function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
}
function setCookie(siteId: string, value: string, maxAge: number) {
  return `${customerCookie(siteId)}=${encodeURIComponent(value)}; Path=${CUSTOMER_COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Signed-in customer and their orders, or { customer: null }.
export async function GET(request: Request) {
  try {
    const siteId = site.parse(new URL(request.url).searchParams.get("site") || "");
    await knownSite(siteId);
    const user = await customerFromCookie(siteId, cookieValue(request, customerCookie(siteId)));
    if (!user) return json({ customer: null });
    return json({ customer: publicCustomer(user), orders: await customerOrders(siteId, user.email) });
  } catch (error) {
    return errorResponse(error instanceof z.ZodError ? new StoreError("Not found.", 404) : error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await readJson(request, 20000));
    if (!parsed.success) throw new StoreError("Check the form fields.");
    const input = parsed.data;
    await knownSite(input.site);
    const ip = clientIp(request);
    if (input.action === "login" || input.action === "register") {
      await limitCustomer(input.site, input.action, ip, input.action === "login" ? 10 : 5, 15);
      const { user, cookie } =
        input.action === "login"
          ? await signInCustomer(input.site, input.login, input.password)
          : await registerCustomer(input.site, input);
      return json(
        { customer: publicCustomer(user), orders: await customerOrders(input.site, user.email) },
        { headers: { "Set-Cookie": setCookie(input.site, cookie.value, cookie.maxAge) } },
      );
    }
    if (input.action === "lookup") {
      await limitCustomer(input.site, "lookup", ip, 10, 15);
      return json({ order: await findGuestOrder(input.site, input.number, input.contact) });
    }
    if (input.action === "logout")
      return json({ customer: null }, { headers: { "Set-Cookie": setCookie(input.site, "", 0) } });
    const user = await customerFromCookie(input.site, cookieValue(request, customerCookie(input.site)));
    if (!user) throw new StoreError("Please sign in again.", 401);
    if (input.action === "profile") {
      const u = await updateCustomer(input.site, user.id, input);
      return json({ customer: publicCustomer(u), orders: await customerOrders(input.site, u.email) });
    }
    await limitCustomer(input.site, "password", ip, 5, 15);
    await changeCustomerPassword(input.site, user.id, input.current, input.next);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
