import { siteCookie } from "./site-links";
// The admin shell selects the website before child effects run (layout effect);
// every API call then carries it explicitly as ?site=.
let selected = "";
export function setCurrentSite(id: string) {
  selected = id;
  try {
    document.cookie = `${siteCookie}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {}
}
// Owner leaves a client (studio mode): no website is selected until one is opened again.
export function clearCurrentSite() {
  selected = "";
  try {
    document.cookie = `${siteCookie}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {}
}
export function currentSiteId() {
  if (selected || typeof document === "undefined") return selected;
  const value = document.cookie
    .split("; ")
    .find((c) => c.startsWith(siteCookie + "="))
    ?.slice(siteCookie.length + 1);
  try {
    return value ? decodeURIComponent(value) : "";
  } catch {
    return "";
  }
}
export function withSite(url: string, siteId = currentSiteId()) {
  if (!siteId) return url;
  return `${url}${url.includes("?") ? "&" : "?"}site=${encodeURIComponent(siteId)}`;
}
