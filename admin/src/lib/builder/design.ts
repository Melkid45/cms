import type { CSSProperties } from "react";
import type { Brand } from "./types";
import { fontFamily } from "./fonts";
import { contrastRatio } from "../image-colors";

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
  } as CSSProperties;
}
