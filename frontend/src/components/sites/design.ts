// Design tokens of the static demo sites (axiom, forma, maison), from origin/main. The CMS itself
// uses project.style + project.fonts (admin/src/lib/builder/style-presets.ts); this copy lives
// here because only the frontend demos use it.
import { fontFamily, type WebsiteFont } from "./fonts";
type CSSProperties = Record<string, string | number>;
type Brand = {
  primary: string;
  secondary: string;
  alternative: string;
  buttonColor?: string;
  headingFont?: WebsiteFont;
  bodyFont?: WebsiteFont;
  headingScale?: "compact" | "standard" | "large";
  corners?: "square" | "subtle" | "rounded";
  containerWidth?: number;
  density?: "compact" | "standard" | "spacious";
};
function contrastRatio(a: string, b: string) {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function designVariables(b: Brand): CSSProperties {
  return {
    "--container-width": `${b.containerWidth || 1820}px`,
    "--color-ink": b.primary,
    "--color-bg": b.secondary,
    "--color-accent": b.alternative,
    "--color-surface": `color-mix(in srgb, ${b.secondary} 93%, ${b.primary})`,
    "--color-muted": `color-mix(in srgb, ${b.primary} 65%, ${b.secondary})`,
    "--color-border": `color-mix(in srgb, ${b.primary} 18%, ${b.secondary})`,
    "--color-interactive": b.buttonColor || b.primary,
    "--color-button": b.buttonColor || b.primary,
    "--color-button-text":
      (contrastRatio(b.buttonColor || b.primary, "#FFFFFF") || 0) >=
      (contrastRatio(b.buttonColor || b.primary, "#000000") || 0)
        ? "#FFFFFF"
        : "#000000",
    "--color-button-hover": `color-mix(in srgb, ${b.buttonColor || b.primary} 85%, white)`,
    "--site-heading-font": fontFamily(b.headingFont),
    "--site-body-font": fontFamily(b.bodyFont),
    "--heading-scale":
      b.headingScale === "compact"
        ? 0.85
        : b.headingScale === "large"
          ? 1.12
          : 1,
    "--radius":
      b.corners === "square" ? "0px" : b.corners === "subtle" ? "6px" : "16px",
    "--radius-button":
      b.corners === "square" ? "0px" : b.corners === "subtle" ? "4px" : "8px",
    "--section-space":
      b.density === "compact"
        ? "clamp(48px, 7.8125vw, 150px)"
        : b.density === "spacious"
          ? "clamp(80px, 12.5vw, 240px)"
          : "clamp(64px, 10.416667vw, 200px)",
  };
}
