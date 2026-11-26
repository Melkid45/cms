// Website style presets (library agent, 2026-11-19): one choice sets the palette, font pair,
// corner radius, section spacing and button shape at once. Applying a preset copies its values
// into the project (brand colours, fonts, project.style); every value can be changed afterwards.
import type { FontPairId } from "./font-pairs";

export const SPACINGS = ["compact", "normal", "airy"] as const;
export const BUTTON_SHAPES = ["square", "rounded", "pill"] as const;
// Button look / hover motion, heading size and content width (from origin/main Site design).
export const BUTTON_STYLES = ["filled", "outline", "soft"] as const;
export const BUTTON_MOTIONS = ["fade", "lift", "scale", "shine", "none"] as const;
export const HEADING_SCALES = ["compact", "standard", "large"] as const;
export const CONTAINER_WIDTHS = [1440, 1600, 1820, 1920] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type ButtonMotion = (typeof BUTTON_MOTIONS)[number];
export type HeadingScale = (typeof HEADING_SCALES)[number];
export type ContainerWidth = (typeof CONTAINER_WIDTHS)[number];
export type Spacing = (typeof SPACINGS)[number];
export type ButtonShape = (typeof BUTTON_SHAPES)[number];

export interface SiteStyle {
  // Preset the values came from (informational: the values below are what renders).
  preset?: string;
  // Palette colours not covered by the brand colours (#rrggbb). Empty = derived from the brand.
  surface?: string;
  muted?: string;
  // Corner radius of cards and photos in px (0–40).
  radius?: number;
  spacing?: Spacing;
  buttons?: ButtonShape;
  // Explicit button radius overrides the shape preset, independently of cards.
  buttonRadius?: number;
  // Main button colour (#rrggbb; empty = the brand primary colour) and the look + hover motion
  // of main and secondary (outline) buttons. Unset = the library look (button-theme.scss is inactive).
  buttonColor?: string;
  buttonStyle?: ButtonStyle;
  buttonMotion?: ButtonMotion;
  secondaryButtonStyle?: ButtonStyle;
  secondaryButtonMotion?: ButtonMotion;
  // Heading size multiplier (compact 0.85, standard 1, large 1.12).
  headingScale?: HeadingScale;
  // Maximum content width in px (library default 1820).
  containerWidth?: ContainerWidth;
}

export interface StylePreset {
  id: string;
  label: string;
  description: string;
  // bg = page background, surface = cards/panels, ink = text, muted = secondary text, accent = highlight.
  colors: { bg: string; surface: string; ink: string; muted: string; accent: string };
  fonts: FontPairId;
  radius: number;
  spacing: Spacing;
  buttons: ButtonShape;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "warm-cafe",
    label: "Warm café",
    description: "Cream and espresso, soft corners, round buttons.",
    colors: { bg: "#faf6f0", surface: "#f1e7da", ink: "#2b211b", muted: "#7a6a5d", accent: "#d9a273" },
    fonts: "warm",
    radius: 20,
    spacing: "normal",
    buttons: "pill",
  },
  {
    id: "clinical",
    label: "Clinical clean",
    description: "Cool white and deep blue, neat corners, calm sans-serif.",
    colors: { bg: "#f7fafc", surface: "#e9f1f6", ink: "#10293a", muted: "#5a7080", accent: "#7cc6dd" },
    fonts: "clean",
    radius: 14,
    spacing: "normal",
    buttons: "rounded",
  },
  {
    id: "workshop",
    label: "Bold workshop",
    description: "Concrete grey, black and signal yellow, condensed headings, square edges.",
    colors: { bg: "#f2f1ed", surface: "#e3e1da", ink: "#141414", muted: "#5c5a55", accent: "#f2b705" },
    fonts: "bold",
    radius: 2,
    spacing: "compact",
    buttons: "square",
  },
  {
    id: "elegant",
    label: "Elegant restaurant",
    description: "Ivory, charcoal and brass, refined serif, generous space.",
    colors: { bg: "#f6f1ea", surface: "#ece3d6", ink: "#1e1b18", muted: "#7a7065", accent: "#cfac74" },
    fonts: "elegant",
    radius: 0,
    spacing: "airy",
    buttons: "square",
  },
  {
    id: "studio",
    label: "Modern studio",
    description: "Off-white and graphite with a soft lime accent, geometric headings.",
    colors: { bg: "#fafbf7", surface: "#eef0e7", ink: "#252720", muted: "#65675f", accent: "#dce7bb" },
    fonts: "modern",
    radius: 16,
    spacing: "normal",
    buttons: "rounded",
  },
  {
    id: "classic",
    label: "Classic barber",
    description: "Warm paper, dark green ink and oxblood, traditional serif.",
    colors: { bg: "#f3efe7", surface: "#e7e0d3", ink: "#1c2a24", muted: "#5f6c66", accent: "#8c2f2f" },
    fonts: "classic",
    radius: 4,
    spacing: "compact",
    buttons: "square",
  },
  {
    id: "playful",
    label: "Playful",
    description: "Peach and plum, rounded type, big soft corners.",
    colors: { bg: "#fffaf3", surface: "#ffeedd", ink: "#2c1f3f", muted: "#6d6280", accent: "#ff9466" },
    fonts: "friendly",
    radius: 28,
    spacing: "normal",
    buttons: "pill",
  },
  {
    id: "nordic",
    label: "Nordic calm",
    description: "Pale grey-green and pine, light serif headings, lots of air.",
    colors: { bg: "#f4f6f3", surface: "#e5ebe4", ink: "#1f2d27", muted: "#617068", accent: "#a9c4a0" },
    fonts: "editorial",
    radius: 10,
    spacing: "airy",
    buttons: "rounded",
  },
];

export const presetById = (id?: string) => STYLE_PRESETS.find((p) => p.id === id);

const SPACE: Record<Spacing, string> = {
  compact: "clamp(48px, 6.25vw, 120px)",
  normal: "clamp(64px, 10.416667vw, 200px)",
  airy: "clamp(80px, 12.5vw, 240px)",
};
const BUTTON: Record<ButtonShape, string> = {
  square: "0px",
  rounded: "10px",
  pill: "999px",
};
const HEADING_SCALE: Record<HeadingScale, number> = { compact: 0.85, standard: 1, large: 1.12 };
const hex = (value?: string) => (value && /^#[0-9a-f]{6}$/i.test(value) ? value : "");

// CSS variables for the .site-canvas root (only the values that are set).
// WCAG contrast ratio of two #rrggbb colours.
function contrast(a: string, b: string) {
  const lum = (c: string) => {
    const n = parseInt(c.slice(1), 16);
    const lin = (v: number) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// Secondary text must stay readable (4.5:1, PageSpeed accessibility) on the page background and
// on cards: a muted colour that is too light is darkened (too dark: lightened) step by step.
export function readableMuted(muted: string, backgrounds: string[]) {
  const bgs = backgrounds.filter((b) => hex(b));
  if (!hex(muted) || !bgs.length) return muted;
  const n = parseInt(muted.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const target = bgs.every((b) => contrast(b, "#000000") >= contrast(b, "#ffffff")) ? 0 : 255;
  let color = muted;
  for (let step = 0; step <= 20 && bgs.some((b) => contrast(color, b) < 4.6); step++)
    color = "#" + rgb.map((v) => Math.round(v + ((target - v) * step) / 20).toString(16).padStart(2, "0")).join("");
  return color;
}
// bg = the website background (brand secondary colour), for the muted text check.
export function styleVars(style?: SiteStyle, bg?: string): Record<string, string> {
  if (!style) return {};
  const vars: Record<string, string> = {};
  if (hex(style.surface)) vars["--color-surface"] = style.surface!;
  if (hex(style.muted))
    vars["--color-muted"] = readableMuted(style.muted!, [bg || "", style.surface || ""]);
  if (typeof style.radius === "number" && style.radius >= 0 && style.radius <= 40)
    vars["--radius"] = `${style.radius}px`;
  if (style.spacing && SPACE[style.spacing]) vars["--section-space"] = SPACE[style.spacing];
  if (style.buttons && BUTTON[style.buttons]) vars["--button-radius"] = BUTTON[style.buttons];
  if (typeof style.buttonRadius === "number" && style.buttonRadius >= 0 && style.buttonRadius <= 100) {
    vars["--button-radius"] = `${style.buttonRadius}px`;
    vars["--radius-button"] = `${style.buttonRadius}px`;
  }
  if (hex(style.buttonColor)) {
    const c = style.buttonColor!;
    vars["--color-button"] = c;
    vars["--color-interactive"] = c;
    vars["--color-button-text"] = contrast(c, "#ffffff") >= contrast(c, "#000000") ? "#ffffff" : "#000000";
    vars["--color-button-hover"] = `color-mix(in srgb, ${c} 85%, white)`;
  }
  if (style.headingScale && HEADING_SCALE[style.headingScale] !== undefined)
    vars["--heading-scale"] = String(HEADING_SCALE[style.headingScale]);
  if (style.containerWidth && (CONTAINER_WIDTHS as readonly number[]).includes(style.containerWidth))
    vars["--container-width"] = `${style.containerWidth}px`;
  return vars;
}
// data-* attributes of the .site-canvas root that switch on button-theme.scss (only when the
// website chose a button look; otherwise the library buttons stay as they are).
export function buttonAttrs(style?: SiteStyle): Record<string, string> {
  if (
    !style ||
    (!hex(style.buttonColor) && !style.buttonStyle && !style.secondaryButtonStyle && !style.buttonMotion && !style.secondaryButtonMotion)
  )
    return {};
  return {
    "data-button-style": style.buttonStyle || "filled",
    "data-button-motion": style.buttonMotion || "fade",
    "data-secondary-button-style": style.secondaryButtonStyle || "outline",
    "data-secondary-button-motion": style.secondaryButtonMotion || style.buttonMotion || "fade",
  };
}
