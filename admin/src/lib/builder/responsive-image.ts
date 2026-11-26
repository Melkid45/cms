import type { Media } from "./types";
import staticImages from "./static-images.json";
type StaticImage = { width: number; height: number; widths: number[] };
// Responsive copies of uploaded images: `/api/builder/media/{site}/{id}?w=640` returns the
// image resized to that width (WebP, cached; lib/builder/media-file.ts). Only these widths
// are made, so the cache stays small and URLs cannot be enumerated.
export const MEDIA_WIDTHS = [320, 480, 640, 828, 1080, 1440, 1920, 2560];
const LOCAL = /^\/api\/builder\/media\/(?:([a-z0-9]{1,40})\/)?([a-f0-9-]{36})$/;
// Vercel Blob uploads: …/cms-media/{site}/{id}.webp (or the older …/cms-media/{id}.webp).
const BLOB =
  /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\/cms-media\/(?:([a-z0-9]{1,40})\/)?([a-f0-9-]{36})\.webp$/;
// The media route of an uploaded image (local or Blob), or null for any other address.
export function mediaRoute(src: string) {
  const m = LOCAL.exec(src) || BLOB.exec(src);
  if (!m) return null;
  return m[1] ? `/api/builder/media/${m[1]}/${m[2]}` : `/api/builder/media/${m[2]}`;
}
// srcset + natural size of a library picture or an uploaded image; null for other images
// (external URLs), videos and pictures that are already small.
export function responsiveImage(src: string, media: Media[]) {
  // Library pictures (public/images): copies made by scripts/image-variants.mjs.
  const known = (staticImages as Record<string, StaticImage>)[src];
  if (known?.widths.length)
    return {
      srcSet: [
        ...known.widths.map(
          (w) =>
            `${src.replace(/^\/images\//, "/images/_w/").replace(/\.[^.]+$/, `-${w}.webp`)} ${w}w`,
        ),
        `${src} ${known.width}w`,
      ].join(", "),
      width: known.width,
      height: known.height,
    };
  const route = mediaRoute(src);
  if (!route) return null;
  const asset = media.find((m) => m.url === src);
  if (!asset?.width || !asset.height || asset.mime?.startsWith("video/"))
    return null;
  const widths = MEDIA_WIDTHS.filter((w) => w < asset.width * 0.9);
  if (!widths.length) return null;
  return {
    srcSet: [
      ...widths.map((w) => `${route}?w=${w} ${w}w`),
      `${src} ${asset.width}w`,
    ].join(", "),
    width: asset.width,
    height: asset.height,
  };
}
