"use client";
// Website style preset picker + the values it fills (library agent, 2026-11-19).
// Applying a preset only fills the draft; every value stays editable before saving.
import type { ReactNode } from "react";
import { Select, SelectOption } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
export function DesignSection({
  title,
  children,
  preview,
}: {
  title: string;
  children: ReactNode;
  preview?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <h2 className="border-b px-6 py-4 text-base font-semibold">{title}</h2>
      <div className={preview ? "grid lg:grid-cols-2" : ""}>
        <div className="space-y-5 p-6">{children}</div>
        {preview && (
          <div className="flex min-w-0 items-center justify-center border-t bg-neutral-50 p-6 lg:border-t-0 lg:border-l">
            {preview}
          </div>
        )}
      </div>
    </section>
  );
}
function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: T;
  options: readonly T[];
  onChange: (value: T | undefined) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select
        aria-label={label}
        value={value === undefined ? "default" : String(value)}
        onValueChange={(raw) =>
          onChange(options.find((item) => String(item) === raw))
        }
      >
        <SelectOption value="default">Library default</SelectOption>
        {options.map((item) => (
          <SelectOption key={item} value={String(item)}>
            {typeof item === "number"
              ? `${item} px`
              : item[0].toUpperCase() + item.slice(1)}
          </SelectOption>
        ))}
      </Select>
    </div>
  );
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <span
          className="relative size-8 shrink-0 overflow-hidden rounded-full border shadow-sm"
          style={{ background: value }}
        >
          <Input
            type="color"
            aria-label={`${label} color`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        <Input
          aria-label={`${label} HEX`}
          value={value}
          maxLength={7}
          pattern="#[0-9a-fA-F]{6}"
          required
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
        />
      </div>
    </div>
  );
}
export function StylePresetFields({
  look,
  onChange,
  typography,
  buttonPreview,
}: {
  look: Look;
  onChange: (look: Look, fonts?: string) => void;
  typography?: ReactNode;
  buttonPreview?: ReactNode;
}) {
  const buttonRadius =
    look.style.buttonRadius ??
    (look.style.buttons === "pill"
      ? 100
      : look.style.buttons === "square"
        ? 0
        : look.style.buttons === "rounded"
          ? 10
          : 8);
  const setStyle = (patch: Partial<SiteStyle>) =>
    onChange({ ...look, style: { ...look.style, ...patch } });
  const colors = [
    ["bg", "Background"],
    ["surface", "Cards and panels"],
    ["ink", "Text"],
    ["muted", "Secondary text"],
    ["accent", "Accent"],
  ] as const;
  return (
    <div className="space-y-6">
      <DesignSection title="Starting style">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STYLE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              aria-pressed={look.style.preset === preset.id}
              onClick={() => {
                const next = lookFromPreset(preset);
                const {
                  buttonColor,
                  buttonStyle,
                  buttonMotion,
                  secondaryButtonStyle,
                  secondaryButtonMotion,
                  headingScale,
                  containerWidth,
                } = look.style;
                onChange(
                  {
                    ...next,
                    style: {
                      ...next.style,
                      ...defined({
                        buttonColor,
                        buttonStyle,
                        buttonMotion,
                        secondaryButtonStyle,
                        secondaryButtonMotion,
                        headingScale,
                        containerWidth,
                      }),
                    },
                  },
                  preset.fonts,
                );
              }}
              className="relative h-auto flex-col items-stretch gap-3 p-4 text-left whitespace-normal"
            >
              <span className="flex h-10 overflow-hidden rounded-md">
                {Object.entries(preset.colors).map(([key, c]) => (
                  <span
                    key={key}
                    className="flex-1"
                    style={{ background: c }}
                  />
                ))}
              </span>
              <span>{preset.label}</span>
              {look.style.preset === preset.id && (
                <Check className="absolute right-2 top-2 size-4 rounded-full bg-white" />
              )}
            </Button>
          ))}
        </div>
      </DesignSection>
      <DesignSection
        title="Colors"
        preview={
          <div
            className="w-full space-y-4 p-6"
            style={{
              background: look.bg,
              color: look.ink,
              borderRadius: look.style.radius ?? 16,
            }}
          >
            <span
              className="text-xs uppercase tracking-widest"
              style={{ color: look.accent }}
            >
              A considered approach
            </span>
            <h3 className="text-3xl font-semibold">Make room for better.</h3>
            <p style={{ color: look.muted }}>
              Clear ideas. Thoughtful details. A website that feels like you.
            </p>
            <div
              className="p-4"
              style={{
                background: look.surface,
                borderRadius: look.style.radius ?? 16,
              }}
            >
              A card on your website
            </div>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {colors.map(([key, label]) => (
            <ColorField
              key={key}
              label={label}
              value={look[key]}
              onChange={(value) => onChange({ ...look, [key]: value })}
            />
          ))}
        </div>
      </DesignSection>
      {typography}
      <DesignSection title="Buttons" preview={buttonPreview}>
        <ColorField
          label="Button"
          value={look.style.buttonColor || look.ink}
          onChange={(buttonColor) => setStyle({ buttonColor })}
        />
        {look.style.buttonColor && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStyle({ buttonColor: undefined })}
          >
            Use text color
          </Button>
        )}
        <Choice
          label="Button shape"
          value={look.style.buttons}
          options={BUTTON_SHAPES}
          onChange={(buttons) => setStyle({ buttons, buttonRadius: undefined })}
        />
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="button-radius">Button radius</Label>
            <div className="flex items-center gap-2">
              <Input
                aria-label="Button radius in pixels"
                type="number"
                min={0}
                max={100}
                step={1}
                value={
                  look.style.buttonRadius ??
                  (look.style.buttons === "pill"
                    ? 100
                    : look.style.buttons === "square"
                      ? 0
                      : look.style.buttons === "rounded"
                        ? 10
                        : 8)
                }
                onChange={(e) => {
                  if (e.target.value !== "" && e.target.validity.valid)
                    setStyle({ buttonRadius: Number(e.target.value) });
                }}
                className="w-20"
              />
              <span className="text-xs text-neutral-500">px</span>
            </div>
          </div>
          <Slider
            id="button-radius"
            aria-label="Button radius"
            min={0}
            max={100}
            value={buttonRadius}
            onValueChange={(buttonRadius) => setStyle({ buttonRadius })}
          />
          {look.style.buttonRadius !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStyle({ buttonRadius: undefined })}
            >
              Use button shape
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice
            label="Primary button"
            value={look.style.buttonStyle}
            options={BUTTON_STYLES}
            onChange={(buttonStyle) => setStyle({ buttonStyle })}
          />
          <Choice
            label="Primary hover"
            value={look.style.buttonMotion}
            options={BUTTON_MOTIONS}
            onChange={(buttonMotion) => setStyle({ buttonMotion })}
          />
          <Choice
            label="Secondary button"
            value={look.style.secondaryButtonStyle}
            options={BUTTON_STYLES}
            onChange={(secondaryButtonStyle) =>
              setStyle({ secondaryButtonStyle })
            }
          />
          <Choice
            label="Secondary hover"
            value={look.style.secondaryButtonMotion}
            options={BUTTON_MOTIONS}
            onChange={(secondaryButtonMotion) =>
              setStyle({ secondaryButtonMotion })
            }
          />
        </div>
      </DesignSection>
      <DesignSection
        title="Layout"
        preview={
          <div className="w-full rounded-lg border bg-white p-3">
            <div
              className="mx-auto space-y-4 transition-all"
              style={{
                width: `${((look.style.containerWidth || 1820) / 1920) * 100}%`,
              }}
            >
              <div className="h-4 rounded bg-neutral-200" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-20"
                    style={{
                      background: look.surface,
                      borderRadius: look.style.radius ?? 16,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  height:
                    look.style.spacing === "compact"
                      ? 16
                      : look.style.spacing === "airy"
                        ? 48
                        : 32,
                }}
              />
              <div
                className="h-14 bg-neutral-100"
                style={{ borderRadius: look.style.radius ?? 16 }}
              />
            </div>
          </div>
        }
      >
        <Choice
          label="Content width"
          value={look.style.containerWidth}
          options={CONTAINER_WIDTHS}
          onChange={(containerWidth) => setStyle({ containerWidth })}
        />
        <Choice
          label="Space between sections"
          value={look.style.spacing}
          options={SPACINGS}
          onChange={(spacing) => setStyle({ spacing })}
        />
        <div className="space-y-2">
          <Label htmlFor="corner-radius">
            Corner radius{" "}
            <span className="float-right text-neutral-500">
              {look.style.radius ?? 16} px
            </span>
          </Label>
          <Slider
            id="corner-radius"
            aria-label="Corner radius"
            min={0}
            max={40}
            value={look.style.radius ?? 16}
            onValueChange={(radius) => setStyle({ radius })}
          />
        </div>
      </DesignSection>
    </div>
  );
}
export function HeadingSizeField({
  look,
  onChange,
}: {
  look: Look;
  onChange: (look: Look) => void;
}) {
  return (
    <Choice
      label="Heading size"
      value={look.style.headingScale}
      options={HEADING_SCALES}
      onChange={(headingScale) =>
        onChange({ ...look, style: { ...look.style, headingScale } })
      }
    />
  );
}
