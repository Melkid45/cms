import { notFound, permanentRedirect } from "next/navigation";
import { isLocale } from "@/lib/builder/i18n";
import { PublicPageView, publicMetadata, redirectFor } from "../../public-page";
import {
  PublicServiceView,
  hasPublicService,
  serviceMetadata,
} from "../../public-service";
export const dynamic = "force-dynamic";
// /site/{site-key}/{lang}/{slug}: pages in a non-default language of a
// multilingual website. The [slug] segment holds the language code here.
// /site/{site-key}/services/{slug}: a standalone service page (public-service.tsx).
type Params = Promise<{ site: string; slug: string; page: string }>;
export async function generateMetadata({ params }: { params: Params }) {
  const { site, slug: lang, page } = await params;
  if (!isLocale(lang)) {
    if (lang === "services")
      return (await serviceMetadata(site, page)) || { title: "Page not found" };
    return { title: "Page not found" };
  }
  return publicMetadata(site, lang, page);
}
export default async function TranslatedPage({ params }: { params: Params }) {
  const { site, slug: lang, page } = await params;
  if (!isLocale(lang)) {
    if (lang === "services" && (await hasPublicService(site, page)))
      return <PublicServiceView siteKey={site} slug={page} />;
    // Old two-segment addresses (e.g. /our-works/kitchens) from the redirect list.
    const target = await redirectFor(site, `/${lang}/${page}`);
    if (target) permanentRedirect(target);
    notFound();
  }
  return <PublicPageView siteKey={site} lang={lang} slug={page} />;
}
