import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { withDoc } from "../doc-store";
import { StoreError } from "../server";
import type { ConnectionStatus, Network } from "./shared";

// Connected social accounts of one website (owner only). Tokens are AES-256-GCM
// encrypted with a key derived from CMS_AUTH_SECRET, stored in `social-accounts:{siteId}`
// and never returned to the browser. Nothing works until the owner sets the app
// credentials below and connects an account through OAuth.

export const GRAPH = "https://graph.facebook.com/v27.0";
const META_DIALOG = "https://www.facebook.com/v27.0/dialog/oauth";
const TIKTOK_AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_API = "https://open.tiktokapis.com/v2";
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"];

export const metaConfigured = () =>
  !!(process.env.SOCIAL_META_APP_ID && process.env.SOCIAL_META_APP_SECRET);
export const tiktokConfigured = () =>
  !!(process.env.SOCIAL_TIKTOK_CLIENT_KEY && process.env.SOCIAL_TIKTOK_CLIENT_SECRET);
// Public https address of the admin (redirect URIs and image URLs for the networks).
export function publicBase() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return /^https:\/\//.test(base) ? base : "";
}
export const redirectUri = (provider: "meta" | "tiktok") =>
  `${publicBase()}/api/builder/social/oauth/${provider}/callback`;

interface MetaPage {
  id: string;
  name: string;
  token: string; // encrypted Page access token
  instagram?: { id: string; username: string };
}
export interface SocialAccounts {
  meta?: {
    connectedAt: string;
    pages: MetaPage[];
    pageId?: string;
    instagram: boolean;
  };
  tiktok?: {
    connectedAt: string;
    openId: string;
    name: string;
    accessToken: string; // encrypted
    refreshToken: string; // encrypted
    expiresAt: string;
    refreshExpiresAt: string;
  };
}
export const accountsStore = <T>(
  siteId: string,
  fn: (data: SocialAccounts) => T | Promise<T>,
  write = true,
) => withDoc<SocialAccounts, T>(`social-accounts:${siteId}`, () => ({}), fn, write);

function key() {
  const secret = process.env.CMS_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV !== "development")
    throw new StoreError("Configure CMS_AUTH_SECRET before connecting accounts.", 503);
  return createHash("sha256")
    .update("harbstone:social:v1:" + (secret || "local-development-only"))
    .digest();
}
export function seal(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map((b) => b.toString("base64url")).join(".");
}
export function unseal(value: string) {
  const [iv, tag, bytes] = value.split(".").map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(bytes), decipher.final()]).toString("utf8");
}

// What the dashboard may know: configured / connected / account name, never tokens.
export async function connectionStatus(siteId: string): Promise<ConnectionStatus[]> {
  const data = await accountsStore(siteId, (d) => d, false);
  const page = data.meta?.pages.find((p) => p.id === data.meta?.pageId);
  return [
    {
      network: "instagram",
      configured: metaConfigured() && !!publicBase(),
      connected: metaConfigured() && !!page?.instagram && !!data.meta?.instagram,
      account: page?.instagram ? `@${page.instagram.username}` : undefined,
    },
    {
      network: "facebook",
      configured: metaConfigured() && !!publicBase(),
      connected: metaConfigured() && !!page,
      account: page?.name,
    },
    {
      network: "tiktok",
      configured: tiktokConfigured() && !!publicBase(),
      connected: tiktokConfigured() && !!data.tiktok,
      account: data.tiktok?.name,
    },
  ];
}
export async function connected(siteId: string, network: Network) {
  return (await connectionStatus(siteId)).find((s) => s.network === network)!
    .connected;
}

// Owner view for Settings → Social accounts (page choice, no tokens).
export async function accountsOverview(siteId: string) {
  const data = await accountsStore(siteId, (d) => d, false);
  return {
    meta: {
      configured: metaConfigured(),
      connectedAt: data.meta?.connectedAt,
      pageId: data.meta?.pageId,
      instagram: data.meta?.instagram ?? false,
      pages: (data.meta?.pages ?? []).map(({ id, name, instagram }) => ({
        id,
        name,
        instagram: instagram?.username,
      })),
    },
    tiktok: {
      configured: tiktokConfigured(),
      connectedAt: data.tiktok?.connectedAt,
      name: data.tiktok?.name,
    },
    publicBase: publicBase(),
    redirectUris: publicBase()
      ? { meta: redirectUri("meta"), tiktok: redirectUri("tiktok") }
      : null,
    statuses: await connectionStatus(siteId),
  };
}

// ---- OAuth -------------------------------------------------------------------
// The start request is authorized (owner session); the callback arrives from the
// network without our SameSite=Strict session, so it is bound by a single-use state
// stored on the server plus a Lax cookie in the same browser.
type Pending = { state: string; siteId: string; provider: string; expires: number };
const oauthStore = <T>(fn: (data: { pending: Pending[] }) => T) =>
  withDoc<{ pending: Pending[] }, T>("social-oauth", () => ({ pending: [] }), fn);
export const STATE_COOKIE = "cms_social_state";

export async function startOAuth(siteId: string, provider: "meta" | "tiktok") {
  if (!publicBase())
    throw new StoreError("Set NEXT_PUBLIC_SITE_URL to the https address of the admin.", 503);
  if (provider === "meta" ? !metaConfigured() : !tiktokConfigured())
    throw new StoreError("The app credentials are not configured on the server.", 503);
  const state = randomBytes(24).toString("base64url");
  await oauthStore((data) => {
    data.pending = data.pending
      .filter((p) => p.expires > Date.now())
      .slice(-20)
      .concat({ state, siteId, provider, expires: Date.now() + 10 * 60_000 });
  });
  const url =
    provider === "meta"
      ? `${META_DIALOG}?${new URLSearchParams({
          client_id: process.env.SOCIAL_META_APP_ID!,
          redirect_uri: redirectUri("meta"),
          state,
          response_type: "code",
          scope: META_SCOPES.join(","),
        })}`
      : `${TIKTOK_AUTHORIZE}?${new URLSearchParams({
          client_key: process.env.SOCIAL_TIKTOK_CLIENT_KEY!,
          response_type: "code",
          scope: TIKTOK_SCOPES.join(","),
          redirect_uri: redirectUri("tiktok"),
          state,
        })}`;
  return { url, state };
}

async function takeState(state: string, cookie: string | undefined, provider: string) {
  const a = Buffer.from(state),
    b = Buffer.from(cookie || "");
  if (!state || a.length !== b.length || !timingSafeEqual(a, b))
    throw new StoreError("The sign-in link expired. Start again.", 400);
  const pending = await oauthStore((data) => {
    const found = data.pending.find((p) => p.state === state);
    data.pending = data.pending.filter((p) => p.state !== state);
    return found;
  });
  if (!pending || pending.provider !== provider || pending.expires < Date.now())
    throw new StoreError("The sign-in link expired. Start again.", 400);
  return pending.siteId;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string } | string;
    error_description?: string;
  };
  if (!response.ok) {
    const message =
      typeof data.error === "object" ? data.error?.message : data.error_description;
    throw new StoreError(`The network refused: ${message || response.status}`, 502);
  }
  return data;
}

export async function finishMeta(code: string, state: string, cookie?: string) {
  const siteId = await takeState(state, cookie, "meta");
  const app = {
    client_id: process.env.SOCIAL_META_APP_ID!,
    client_secret: process.env.SOCIAL_META_APP_SECRET!,
  };
  const short = await getJson<{ access_token: string }>(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({ ...app, redirect_uri: redirectUri("meta"), code })}`,
  );
  const long = await getJson<{ access_token: string }>(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({ ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`,
  );
  // Page tokens from a long-lived user token do not expire.
  const pages = await getJson<{
    data: {
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string };
    }[];
  }>(
    `${GRAPH}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token,instagram_business_account{id,username}", access_token: long.access_token })}`,
  );
  if (!pages.data.length)
    throw new StoreError("This Facebook account manages no Pages.", 400);
  await accountsStore(siteId, (data) => {
    data.meta = {
      connectedAt: new Date().toISOString(),
      pages: pages.data.slice(0, 50).map((page) => ({
        id: page.id,
        name: page.name,
        token: seal(page.access_token),
        instagram: page.instagram_business_account
          ? {
              id: page.instagram_business_account.id,
              username: page.instagram_business_account.username || "instagram",
            }
          : undefined,
      })),
      pageId: pages.data.length === 1 ? pages.data[0].id : undefined,
      instagram: true,
    };
  });
  return siteId;
}

export async function finishTikTok(code: string, state: string, cookie?: string) {
  const siteId = await takeState(state, cookie, "tiktok");
  const token = await tiktokToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri("tiktok"),
  });
  let name = "TikTok account";
  try {
    const info = await getJson<{ data?: { user?: { display_name?: string } } }>(
      `${TIKTOK_API}/user/info/?fields=open_id,display_name`,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    name = info.data?.user?.display_name || name;
  } catch {}
  await accountsStore(siteId, (data) => {
    data.tiktok = tiktokRecord(token, name);
  });
  return siteId;
}

type TikTokToken = {
  access_token: string;
  refresh_token: string;
  open_id: string;
  expires_in: number;
  refresh_expires_in: number;
};
function tiktokRecord(token: TikTokToken, name: string) {
  return {
    connectedAt: new Date().toISOString(),
    openId: token.open_id,
    name,
    accessToken: seal(token.access_token),
    refreshToken: seal(token.refresh_token),
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + token.refresh_expires_in * 1000).toISOString(),
  };
}
async function tiktokToken(params: Record<string, string>) {
  return getJson<TikTokToken>(`${TIKTOK_API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.SOCIAL_TIKTOK_CLIENT_KEY!,
      client_secret: process.env.SOCIAL_TIKTOK_CLIENT_SECRET!,
      ...params,
    }),
  });
}

// Access tokens live 2 hours; the refresh token rotates on every refresh.
export async function tiktokAccess(siteId: string) {
  const data = await accountsStore(siteId, (d) => d, false);
  if (!data.tiktok || !tiktokConfigured())
    throw new StoreError("TikTok is not connected.", 409);
  if (new Date(data.tiktok.expiresAt).getTime() > Date.now() + 5 * 60_000)
    return unseal(data.tiktok.accessToken);
  const token = await tiktokToken({
    grant_type: "refresh_token",
    refresh_token: unseal(data.tiktok.refreshToken),
  });
  const name = data.tiktok.name;
  await accountsStore(siteId, (d) => {
    d.tiktok = tiktokRecord(token, name);
  });
  return token.access_token;
}

export async function metaPage(siteId: string) {
  const data = await accountsStore(siteId, (d) => d, false);
  const page = data.meta?.pages.find((p) => p.id === data.meta?.pageId);
  if (!page || !metaConfigured())
    throw new StoreError("Facebook is not connected.", 409);
  return { ...page, token: unseal(page.token), useInstagram: data.meta!.instagram };
}

export async function chooseMetaPage(siteId: string, pageId: string, instagram: boolean) {
  return accountsStore(siteId, (data) => {
    if (!data.meta?.pages.some((p) => p.id === pageId))
      throw new StoreError("Choose one of the connected Pages.");
    data.meta.pageId = pageId;
    data.meta.instagram = instagram;
  });
}

export async function disconnect(siteId: string, provider: "meta" | "tiktok") {
  return accountsStore(siteId, (data) => {
    delete data[provider];
  });
}
