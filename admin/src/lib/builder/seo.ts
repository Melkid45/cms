import type { Project } from "./types";
export function siteOrigin(project: Project): string | undefined {
  const configured =
    project.website?.url ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  try {
    const url = new URL(configured);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
export const privatePaths = [
  "/dashboard",
  "/login",
  "/register",
  "/api/",
  "/canvas",
  "/library/",
  "/catalog-preview",
  "/product-preview",
  "/cart-preview",
];
export function publicMetadata(
  project: Project,
  title: string,
  description: string,
  path: string,
  image?: string,
) {
  const origin = siteOrigin(project);
  return {
    title: { absolute: title },
    description,
    alternates: origin ? { canonical: new URL(path, origin).href } : undefined,
    openGraph: {
      siteName: project.brand.name,
      title,
      description,
      images: image ? [image] : [],
    },
  };
}
