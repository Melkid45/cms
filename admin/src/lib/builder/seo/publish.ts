import "server-only";
import { warmOg } from "./server";
import { seoPack } from "./pack";
import { pingIndexNow } from "./indexnow";

// Runs after a page is published (builder PUT ?publish=, via after()): renders the
// automatic share image (SEO pack) and tells IndexNow about the new version. Best effort.
export async function afterPublish(siteId: string, pageId: string) {
  await Promise.all([
    seoPack(siteId).then((on) => (on ? warmOg(siteId, pageId) : undefined)),
    pingIndexNow(siteId, pageId),
  ]).catch(() => {});
}
