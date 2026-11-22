// Public website URLs: /site/{site-key}/{page-slug}. Without a key the legacy
// /site/{slug} form is used; it redirects to the first website.
export function sitePath(siteKey: string | undefined, slug: string) {
  return siteKey ? `/site/${siteKey}/${slug}` : `/site/${slug}`;
}
export const siteKeyPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Remembers the selected website per browser; server routes read it as a fallback.
export const siteCookie = "cms_site";
