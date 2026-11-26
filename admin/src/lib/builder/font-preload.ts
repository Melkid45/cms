import files from "./site-font-files.json";
import { DEFAULT_FONT_PAIR, FONT_PAIRS } from "./font-pairs";
// Font files a public page preloads: only the website's own pair (heading face in the pair's
// heading weight, body face in 400), only the subsets its language needs. The files and
// @font-face rules are the self-hosted copies in public/fonts (site-fonts.<hash>.css).
type Face = { family: string; file: string; weight: string; style: string; range: string };
const SUBSETS: Record<string, RegExp> = {
  latin: /^U\+\?\?/,
  "latin-ext": /^U\+100-2BA/,
  cyrillic: /^U\+301,U\+400-45F/,
};
const LOCALE_SUBSETS: Record<string, string[]> = {
  lv: ["latin", "latin-ext"],
  ru: ["latin", "cyrillic"],
  de: ["latin"],
  en: ["latin"],
};
const covers = (weight: string, wanted: number) => {
  const [from, to = from] = weight.split(" ").map(Number);
  return wanted >= from && wanted <= to;
};
// Off: in the A/B of 2026-11-19 (12 pages, Lighthouse mobile, 3 runs, median) preloading the pair
// made LCP worse on every page (the fonts compete with the hero image; mean score 84.6 with
// preload vs 86.0 without). Switch on only after a new measurement says otherwise.
const PRELOAD_SITE_FONTS = false;
export function fontPreloads(pairId: string | undefined, locale: string | undefined) {
  if (!PRELOAD_SITE_FONTS) return [];
  const pair =
    FONT_PAIRS.find((p) => p.id === pairId) ||
    FONT_PAIRS.find((p) => p.id === DEFAULT_FONT_PAIR)!;
  const subsets = LOCALE_SUBSETS[locale || ""] || ["latin"];
  const faces = files.faces as Face[];
  const vars = files.vars as Record<string, string>;
  const out = new Set<string>();
  for (const [variable, weight] of [
    [pair.heading, pair.weight],
    [pair.body, 400],
  ] as const) {
    const family = vars[variable];
    for (const subset of subsets) {
      // The browser uses the last matching @font-face, so the last one is preloaded.
      const face = faces.findLast(
        (f) =>
          f.family === family &&
          f.style === "normal" &&
          covers(f.weight, weight) &&
          SUBSETS[subset].test(f.range),
      );
      if (face) out.add(face.file);
    }
  }
  return [...out];
}
