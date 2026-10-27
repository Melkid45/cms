export const SITE = 'https://harbcms.vercel.app';
export function pageLinks(paths) {
  const html = paths.filter(path => /^frontend\/[^/]+\.html$/.test(path));
  return [...new Set(html.map(path => `${SITE}/${encodeURIComponent(path.slice('frontend/'.length))}`))];
}
export async function deploymentReady(commit, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${SITE}/harbstone-release.json?commit=${commit}&t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    return response.ok && (await response.json()).commit === commit;
  } catch { return false; }
}
export async function waitForDeployment(commit, { timeout = 180000, interval = 10000, check = deploymentReady } = {}) {
  const deadline = Date.now() + timeout;
  do {
    if (await check(commit)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, Math.min(interval, Math.max(0, deadline - Date.now()))));
  } while (Date.now() <= deadline);
  return false;
}
