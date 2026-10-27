export const SITE = 'https://harbcms.vercel.app';
export const ADMIN_SITE = 'https://harbstone-admin.vercel.app';
export function deploymentTargets(paths){
  const targets=[];
  if(paths.some(path=>path.startsWith('frontend/')))targets.push('frontend');
  if(paths.some(path=>path.startsWith('admin/')||/^frontend\/(src\/|public\/|images\/)/.test(path)))targets.push('admin');
  return targets;
}
export function pageLinks(paths) {
  const html = paths.filter(path => /^frontend\/[^/]+\.html$/.test(path));
  const links=html.map(path => `${SITE}/${encodeURIComponent(path.slice('frontend/'.length))}`);
  if(deploymentTargets(paths).includes('admin'))links.push(`${ADMIN_SITE}/dashboard/pages`,`${ADMIN_SITE}/site/home`);
  return [...new Set(links)];
}
export async function deploymentReady(commit, fetchImpl = fetch, targets=['frontend']) {
  try {
    const checks=await Promise.all(targets.map(async target=>{
      const endpoint=target==='admin'?`${ADMIN_SITE}/api/release`:`${SITE}/harbstone-release.json`;
      const response = await fetchImpl(`${endpoint}?commit=${commit}&t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      return response.ok && (await response.json()).commit === commit;
    }));return checks.every(Boolean);
  } catch { return false; }
}
export async function waitForDeployment(commit, { timeout = 240000, interval = 10000, targets=['frontend'],check = commit=>deploymentReady(commit,fetch,targets) } = {}) {
  const deadline = Date.now() + timeout;
  do {
    if (await check(commit)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, Math.min(interval, Math.max(0, deadline - Date.now()))));
  } while (Date.now() <= deadline);
  return false;
}
