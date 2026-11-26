import "server-only";
import { StoreError } from "../server";
import { siteByKey } from "../sites";
import { siteSuspended } from "../billing";
import { readPublicProject } from "../products/public";
import { NOINDEX_HEADERS, siteAddress } from "./server";
import { llmsText } from "./ai";
import { seoPack } from "./pack";

const missing = () => new Response("Not found", { status: 404 });
// Shared by /site/{key}/llms.txt and llms-full.txt. Only for websites with the SEO pack,
// not hidden from search engines and not suspended.
export async function llmsResponse(request: Request, key: string, full: boolean) {
  const site = await siteByKey(key);
  if (!site || (await siteSuspended(site.id)) || !(await seoPack(site.id))) return missing();
  let project;
  try {
    project = await readPublicProject(site.id, site.key);
  } catch (error) {
    if (error instanceof StoreError && error.status === 404) return missing();
    throw error;
  }
  if (project.seo?.hideSite) return missing();
  const address = await siteAddress(site, project, request.headers);
  const body = llmsText(project, site.key, address.absolute, full);
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=600",
      ...(address.live ? {} : NOINDEX_HEADERS),
    },
  });
}
