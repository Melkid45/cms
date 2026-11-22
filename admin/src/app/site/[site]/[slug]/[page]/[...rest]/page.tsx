import { notFound, permanentRedirect } from "next/navigation";
import { redirectFor } from "../../../public-page";
export const dynamic = "force-dynamic";
// /site/{key}/a/b/c…: no page lives this deep; only old addresses from the website's
// redirect list (Settings → SEO → Redirects) are answered, with a permanent redirect.
type Params = Promise<{ site: string; slug: string; page: string; rest: string[] }>;
export default async function DeepPath({ params }: { params: Params }) {
  const { site, slug, page, rest } = await params;
  const target = await redirectFor(site, `/${[slug, page, ...rest].join("/")}`);
  if (target) permanentRedirect(target);
  notFound();
}
