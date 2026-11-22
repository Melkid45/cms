"use client";
// Website style preset picker + the values it fills (library agent, 2026-11-19).
// Applying a preset only fills the draft; every value stays editable before saving.
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { Project } from "@/lib/builder/types";
import {
  BUTTON_MOTIONS,
  BUTTON_SHAPES,
  BUTTON_STYLES,
  CONTAINER_WIDTHS,
  HEADING_SCALES,
  SPACINGS,
  STYLE_PRESETS,
  type SiteStyle,
  type StylePreset,
} from "@/lib/builder/style-presets";

export interface Look {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  style: SiteStyle;
}

// Same mix as the site canvas uses when surface/muted are not set (sRGB approximation).
function mix(a: string, b: string, share: number) {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
    const n = m ? parseInt(m[1], 16) : 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [x, y] = [parse(a), parse(b)];
  return (
    "#" +
    x
      .map((v, i) => Math.round(v * share + y[i] * (1 - share)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function lookOf(project: Project): Look {
  const b = project.brand;
  const style = project.style || {};
  return {
    bg: b.secondary,
    ink: b.primary,
    accent: b.alternative,
    surface: style.surface || mix(b.secondary, b.primary, 0.93),
    muted: style.muted || mix(b.primary, b.secondary, 0.65),
    style,
  };
}

export function lookFromPreset(preset: StylePreset): Look {
  return {
    ...preset.colors,
    style: {
      preset: preset.id,
      surface: preset.colors.surface,
      muted: preset.colors.muted,
      radius: preset.radius,
      spacing: preset.spacing,
      buttons: preset.buttons,
    },
  };
}

// Writes a look into the project: brand colours (ink / background / accent) + project.style.
export function applyLook(project: Project, look: Look): Project {
  return {
    ...project,
    brand: {
      ...project.brand,
      primary: look.ink,
      secondary: look.bg,
      alternative: look.accent,
    },
    style: { ...look.style, surface: look.surface, muted: look.muted },
  };
}

// Drops undefined keys (the style keeps only values that were chosen).
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
const title = (s: string | number) => (typeof s === "number" ? `${s} px` : s[0].toUpperCase() + s.slice(1));
const selectClass =
  "h-10 w-full rounded-xl bg-white px-3 text-sm shadow-[0_0_0_1px_rgb(0_0_0/0.06)] outline-none focus-visible:shadow-[0_0_0_2px_rgb(0_0_0/0.5)]";

export function StylePresetFields({
  look,
  onChange,
}: {
  look: Look;
  onChange: (look: Look, fonts?: string) => void;
}) {
  const set = (patch: Partial<Look>) => onChange({ ...look, ...patch });
  const setStyle = (patch: Partial<SiteStyle>) =>
    onChange({ ...look, style: { ...look.style, ...patch } });
  const colors: [keyof Look, string][] = [
    ["bg", "Background"],
    ["surface", "Cards and panels"],
    ["ink", "Text"],
    ["muted", "Secondary text"],
    ["accent", "Accent"],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-2">
        <Label>Style preset</Label>
        <p className="text-sm text-neutral-500">
          One click sets colours, fonts, corners, spacing and buttons. You can
          change any value below before saving.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STYLE_PRESETS.map((preset) => {
            const active = look.style.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  // A preset sets colours, corners, spacing and button shape; the button look,
                  // heading size and width chosen below stay.
                  const next = lookFromPreset(preset);
                  const { buttonColor, buttonStyle, buttonMotion, secondaryButtonStyle, secondaryButtonMotion, headingScale, containerWidth } = look.style;
                  onChange(
                    { ...next, style: { ...next.style, ...defined({ buttonColor, buttonStyle, buttonMotion, secondaryButtonStyle, secondaryButtonMotion, headingScale, containerWidth }) } },
                    preset.fonts,
                  );
                }}
                className={`relative rounded-xl bg-white p-4 text-left shadow-[0_0_0_1px_rgb(0_0_0/0.06)] transition-colors hover:bg-neutral-50 ${active ? "shadow-[0_0_0_2px_rgb(0_0_0/0.8)]" : ""}`}
              >
                <span
                  className="mb-3 flex h-12 overflow-hidden"
                  style={{ borderRadius: Math.min(preset.radius, 16) }}
                  aria-hidden="true"
                >
                  {Object.values(preset.colors).map((c) => (
                    <span key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </span>
                <span className="block text-sm font-semibold">
                  {preset.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500">
                  {preset.description}
                </span>
                {active && (
                  <Check className="absolute right-3 top-3 size-5 rounded-full bg-white p-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {colors.map(([key, label]) => (
          <label key={key} className="grid gap-2 text-sm font-medium">
            {label}
            <span className="flex items-center gap-2">
              <input
                type="color"
                value={String(look[key])}
                onChange={(e) => set({ [key]: e.target.value } as Partial<Look>)}
                className="h-10 w-12 cursor-pointer rounded-lg bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]"
              />
              <code className="text-xs text-neutral-500">{String(look[key])}</code>
            </span>
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">
          Corner radius: {look.style.radius ?? 16}px
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={look.style.radius ?? 16}
            onChange={(e) => setStyle({ radius: Number(e.target.value) })}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Space between sections
          <select
            className={selectClass}
            value={look.style.spacing || "normal"}
            onChange={(e) =>
              setStyle({ spacing: e.target.value as SiteStyle["spacing"] })
            }
          >
            {SPACINGS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Button shape
          <select
            className={selectClass}
            value={look.style.buttons || "rounded"}
            onChange={(e) =>
              setStyle({ buttons: e.target.value as SiteStyle["buttons"] })
            }
          >
            {BUTTON_SHAPES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ButtonLayoutFields look={look} setStyle={setStyle} />
    </div>
  );
}

// Button colour, look and hover motion, heading size and content width (merged from the
// origin/main Site design screen). "Library default" leaves the value unset: the website keeps
// the look of its blocks (button-theme.scss switches on only when a value is chosen).
function ButtonLayoutFields({
  look,
  setStyle,
}: {
  look: Look;
  setStyle: (patch: Partial<SiteStyle>) => void;
}) {
  const style = look.style;
  const choice = <T extends string | number>(
    label: string,
    value: T | undefined,
    options: readonly T[],
    onPick: (value: T | undefined) => void,
  ) => (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <select
        className={selectClass}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onPick(
            raw === ""
              ? undefined
              : (options.find((o) => String(o) === raw) as T | undefined),
          );
        }}
      >
        <option value="">Library default</option>
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {title(o)}
          </option>
        ))}
      </select>
    </label>
  );
  const buttonColor = style.buttonColor || look.ink;
  return (
    <div className="grid gap-4">
      <div>
        <Label>Buttons, headings and width</Label>
        <p className="mt-1 text-sm text-neutral-500">
          Colour, look and hover effect of the main and secondary buttons,
          heading size and the maximum content width.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">
          Button colour
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={buttonColor}
              onChange={(e) => setStyle({ buttonColor: e.target.value })}
              className="h-10 w-12 cursor-pointer rounded-lg bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]"
            />
            <code className="text-xs text-neutral-500">
              {style.buttonColor || "Text colour"}
            </code>
            {style.buttonColor && (
              <button
                type="button"
                className="text-xs text-neutral-500 underline"
                onClick={() => setStyle({ buttonColor: undefined })}
              >
                Reset
              </button>
            )}
          </span>
        </label>
        {choice("Main button", style.buttonStyle, BUTTON_STYLES, (v) =>
          setStyle({ buttonStyle: v }),
        )}
        {choice("Main button hover", style.buttonMotion, BUTTON_MOTIONS, (v) =>
          setStyle({ buttonMotion: v }),
        )}
        {choice(
          "Secondary button",
          style.secondaryButtonStyle,
          BUTTON_STYLES,
          (v) => setStyle({ secondaryButtonStyle: v }),
        )}
        {choice(
          "Secondary button hover",
          style.secondaryButtonMotion,
          BUTTON_MOTIONS,
          (v) => setStyle({ secondaryButtonMotion: v }),
        )}
        {choice("Heading size", style.headingScale, HEADING_SCALES, (v) =>
          setStyle({ headingScale: v }),
        )}
        {choice("Content width", style.containerWidth, CONTAINER_WIDTHS, (v) =>
          setStyle({ containerWidth: v }),
        )}
      </div>
    </div>
  );
}
