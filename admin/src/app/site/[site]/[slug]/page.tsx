import { PublicPageView, publicMetadata } from "../public-page";
export const dynamic = "force-dynamic";
// /site/{site-key}/{slug}: pages of the default language (or of a single-language
// website); /site/{site-key}/{lang} opens that language's home page.
type Params = Promise<{ site: string; slug: string }>;
export async function generateMetadata({ params }: { params: Params }) {
  const { site, slug } = await params;
  return publicMetadata(site, null, slug);
}
export default async function PublicPage({ params }: { params: Params }) {
  const { site, slug } = await params;
  return <PublicPageView siteKey={site} lang={null} slug={slug} />;
}
