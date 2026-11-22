"use client";
/* eslint-disable @next/next/no-img-element */
import "./button-theme.scss";
import { useState, useRef } from "react";
import Link from "next/link";
import { Select, SelectOption } from "@/components/ui/select";
import { designVariables } from "@/lib/builder/design";
import { websiteFonts, fontFamily } from "@/lib/builder/fonts";
import { WebsiteFonts } from "./website-fonts";
import { Save, Palette } from "lucide-react";
import { useProject } from "@/lib/builder/client";
import type { Project } from "@/lib/builder/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "./media-picker";
import { analyzeLogo, contrastRatio } from "@/lib/image-colors";
export function BrandEditor() {
  const { project, error } = useProject();
  return project ? (
    <Editor project={project} />
  ) : (
    <p>{error || "Loading brand settings…"}</p>
  );
}
function Editor({ project }: { project: Project }) {
  const { save } = useProject();
  const analysisRequest = useRef(0);
  const [previewFonts, setPreviewFonts] = useState(false);
  const [brand, setBrand] = useState(project.brand),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(brand) !== JSON.stringify(project.brand);
  async function extract(url = brand.logo) {
    if (!url) return;
    const request = ++analysisRequest.current;
    setBusy(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const analysis = await analyzeLogo(
        new File([blob], "logo.webp", { type: blob.type }),
      );
      if (request !== analysisRequest.current) return;
      const palette = analysis.palette;
      const primaryIsDark =
        (contrastRatio(palette.primary, "#FFFFFF") ?? 0) >=
        (contrastRatio(palette.secondary, "#FFFFFF") ?? 0);
      setBrand((current) => ({
        ...current,
        logo: url,
        ...palette,
        buttonColor: palette.primary,
        primary: primaryIsDark ? palette.primary : palette.secondary,
        secondary: primaryIsDark ? palette.secondary : palette.primary,
      }));
      setNotice("Colors extracted. Adjust the palette below, then save.");
    } catch (e) {
      if (request !== analysisRequest.current) return;
      setNotice(e instanceof Error ? e.message : "Could not extract colors");
    } finally {
      if (request === analysisRequest.current) setBusy(false);
    }
  }
  return (
    <form
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await save({ ...project, brand });
          setNotice("Design saved.");
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <WebsiteFonts
        fonts={
          previewFonts
            ? websiteFonts.map((font) => font.value)
            : [brand.headingFont, brand.bodyFont]
        }
      />
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Logos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Header logo</Label>
              <MediaPicker
                value={brand.logo}
                label="Choose logo"
                onChange={(logo) => {
                  setBrand((current) => ({ ...current, logo }));
                  if (logo) void extract(logo);
                  else {
                    analysisRequest.current++;
                    setBusy(false);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!brand.logo || busy}
                onClick={() => void extract()}
              >
                <Palette />
                {busy ? "Analyzing…" : "Extract colors from logo"}
              </Button>
            </div>
            <div className="space-y-3">
              <Label>Footer logo (optional)</Label>
              <MediaPicker
                value={brand.footerLogo}
                label="Choose footer logo"
                onChange={(footerLogo) => setBrand({ ...brand, footerLogo })}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Website palette</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["primary", "Text"],
                ["buttonColor", "Buttons"],
                ["secondary", "Background"],
                ["alternative", "Accent"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`color-${key}`}>{label}</Label>
                <div className="flex items-center gap-3 rounded-lg border px-3 py-2 focus-within:border-neutral-400">
                  <input
                    type="color"
                    aria-label={`${label} color picker`}
                    value={
                      /^#[a-f\d]{6}$/i.test(brand[key] || "")
                        ? brand[key]
                        : brand.primary
                    }
                    onChange={(e) =>
                      setBrand({ ...brand, [key]: e.target.value })
                    }
                    className="design-color-picker size-7 shrink-0 cursor-pointer overflow-hidden rounded-full border-0 bg-transparent p-0"
                  />
                  <Input
                    id={`color-${key}`}
                    value={brand[key] || brand.primary}
                    pattern="#[a-fA-F0-9]{6}"
                    required
                    onChange={(e) =>
                      setBrand({ ...brand, [key]: e.target.value })
                    }
                    className="h-7 border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Typography</CardTitle>
          </CardHeader>
          <CardContent
            className="space-y-5"
            onPointerDown={() => setPreviewFonts(true)}
            onFocusCapture={() => setPreviewFonts(true)}
          >
            {(["headingFont", "bodyFont"] as const).map((key) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>
                  {key === "headingFont" ? "Heading font" : "Body font"}
                </Label>
                <Select
                  id={key}
                  value={brand[key] || "manrope"}
                  onValueChange={(value) =>
                    setBrand({ ...brand, [key]: value })
                  }
                  className="h-12"
                >
                  {websiteFonts.map((font) => (
                    <SelectOption key={font.value} value={font.value}>
                      <span
                        style={{ fontFamily: fontFamily(font.value) }}
                        className="text-lg"
                      >
                        {font.label} · Aa Бб
                      </span>
                    </SelectOption>
                  ))}
                </Select>
              </div>
            ))}
            <DesignChoice
              label="Heading size"
              value={brand.headingScale || "standard"}
              options={["compact", "standard", "large"]}
              onChange={(headingScale) => setBrand({ ...brand, headingScale })}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <DesignChoice
              label="Primary button"
              value={brand.buttonStyle || "filled"}
              options={["filled", "outline", "soft"]}
              onChange={(buttonStyle) => setBrand({ ...brand, buttonStyle })}
            />
            <div className="space-y-2">
              <Label htmlFor="button-motion">Hover animation</Label>
              <Select
                id="button-motion"
                value={brand.buttonMotion || "fade"}
                onValueChange={(buttonMotion) =>
                  setBrand({
                    ...brand,
                    buttonMotion:
                      buttonMotion as Project["brand"]["buttonMotion"],
                  })
                }
              >
                <SelectOption value="fade">Color fade</SelectOption>
                <SelectOption value="lift">Lift</SelectOption>
                <SelectOption value="scale">Soft scale</SelectOption>
                <SelectOption value="shine">Shine</SelectOption>
                <SelectOption value="none">None</SelectOption>
              </Select>
            </div>
            <DesignChoice
              label="Secondary button"
              value={brand.secondaryButtonStyle || "outline"}
              options={["filled", "outline", "soft"]}
              onChange={(secondaryButtonStyle) =>
                setBrand({ ...brand, secondaryButtonStyle })
              }
            />
            <div className="space-y-2">
              <Label htmlFor="secondary-button-motion">
                Secondary hover animation
              </Label>
              <Select
                id="secondary-button-motion"
                value={
                  brand.secondaryButtonMotion || brand.buttonMotion || "fade"
                }
                onValueChange={(value) =>
                  setBrand({
                    ...brand,
                    secondaryButtonMotion:
                      value as Project["brand"]["secondaryButtonMotion"],
                  })
                }
              >
                <SelectOption value="fade">Color fade</SelectOption>
                <SelectOption value="lift">Lift</SelectOption>
                <SelectOption value="scale">Soft scale</SelectOption>
                <SelectOption value="shine">Shine</SelectOption>
                <SelectOption value="none">None</SelectOption>
              </Select>
            </div>
            <div
              style={designVariables(brand)}
              data-secondary-button-style={
                brand.secondaryButtonStyle || "outline"
              }
              data-secondary-button-motion={
                brand.secondaryButtonMotion || brand.buttonMotion || "fade"
              }
              data-button-style={brand.buttonStyle || "filled"}
              data-button-motion={brand.buttonMotion || "fade"}
              className="flex min-h-32 flex-wrap items-center justify-center gap-3 rounded-xl border bg-[var(--color-bg)] p-7"
            >
              <button type="button" className="design-button">
                Discuss your project
              </button>
              <button
                type="button"
                className="design-button design-button--secondary"
              >
                Explore our work
              </button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Layout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <DesignChoice
              label="Container width (px)"
              value={String(brand.containerWidth || 1820)}
              options={["1440", "1600", "1820", "1920"]}
              onChange={(value) =>
                setBrand({
                  ...brand,
                  containerWidth: Number(
                    value,
                  ) as Project["brand"]["containerWidth"],
                })
              }
            />
            <div
              className="rounded-lg border bg-neutral-50 px-3 py-5"
              aria-label={`Container preview: ${brand.containerWidth || 1820} pixels`}
            >
              <div
                style={{
                  width: `${((brand.containerWidth || 1820) / 1920) * 100}%`,
                }}
                className="mx-auto grid grid-cols-4 gap-2 rounded border border-neutral-300 bg-white p-2"
              >
                {[0, 1, 2, 3].map((column) => (
                  <div
                    key={column}
                    className="h-12 rounded-sm bg-neutral-200"
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Shape & spacing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <DesignChoice
              label="Corners"
              value={brand.corners || "rounded"}
              options={["square", "subtle", "rounded"]}
              onChange={(corners) => setBrand({ ...brand, corners })}
            />
            <DesignChoice
              label="Section spacing"
              value={brand.density || "standard"}
              options={["compact", "standard", "spacious"]}
              onChange={(density) => setBrand({ ...brand, density })}
            />
          </CardContent>
        </Card>
        <div className="flex items-center gap-5">
          <Button type="submit" disabled={busy}>
            <Save />
            {busy ? "Saving…" : "Save site design"}
          </Button>
          <p role="status" className="text-sm">
            {notice}
          </p>
        </div>
      </div>
      <aside className="min-w-0 xl:sticky xl:top-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">Live sample</span>
          <span className="text-xs text-neutral-500">
            {dirty ? "Unsaved changes" : "Saved design"}
          </span>
        </div>
        <div
          data-secondary-button-style={brand.secondaryButtonStyle || "outline"}
          data-secondary-button-motion={
            brand.secondaryButtonMotion || brand.buttonMotion || "fade"
          }
          data-button-style={brand.buttonStyle || "filled"}
          data-button-motion={brand.buttonMotion || "fade"}
          style={designVariables(brand)}
          className="overflow-hidden rounded-xl border shadow-sm"
        >
          <div
            style={{
              background: "var(--color-bg)",
              color: "var(--color-ink)",
              fontFamily: fontFamily(brand.bodyFont),
            }}
            className="p-7 sm:p-9"
          >
            <div className="mb-14 flex items-center justify-between text-xs">
              {brand.logo ? (
                <img
                  src={brand.logo}
                  alt={brand.name}
                  className="h-7 max-w-40 object-contain"
                />
              ) : (
                <strong
                  style={{ fontFamily: fontFamily(brand.headingFont) }}
                  className="text-xl tracking-tight"
                >
                  {brand.name || "Your website"}
                </strong>
              )}
              <span>About · Contact</span>
            </div>
            <span className="text-xs uppercase tracking-widest">
              Built around your ideas
            </span>
            <h2
              style={{
                fontFamily: fontFamily(brand.headingFont),
                fontSize: `calc(38px * var(--heading-scale))`,
                lineHeight: 1.12,
                letterSpacing: "-0.035em",
              }}
              className="mt-5 mb-5"
            >
              A different perspective.
              <br />A lasting impression.
            </h2>
            <p
              style={{ color: "var(--color-muted)" }}
              className="text-base leading-relaxed"
            >
              Thoughtful details make the difference. Посмотрите, как выглядит
              выбранный шрифт на русском языке.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" className="design-button">
                Get in touch
              </button>
              <button
                type="button"
                className="design-button design-button--secondary"
              >
                Explore our work
              </button>
            </div>
            <div
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius)",
                marginTop:
                  brand.density === "compact"
                    ? 32
                    : brand.density === "spacious"
                      ? 72
                      : 48,
              }}
              className="p-6"
            >
              <span
                style={{
                  background: "var(--color-accent)",
                  color: "var(--color-ink)",
                  borderRadius: "var(--radius-button)",
                }}
                className="inline-block px-3 py-1 text-xs"
              >
                Your accent
              </span>
              <h3
                style={{ fontFamily: fontFamily(brand.headingFont) }}
                className="mt-4 mb-2 text-2xl"
              >
                Considered in every detail
              </h3>
              <p
                style={{ color: "var(--color-muted)" }}
                className="text-sm leading-relaxed"
              >
                One consistent design across your pages, cards and calls to
                action.
              </p>
            </div>
          </div>
        </div>
        <Link
          href="/dashboard/layout"
          className="mt-5 inline-block text-sm underline underline-offset-4"
        >
          Configure header, footer & menus
        </Link>
      </aside>
    </form>
  );
}

function DesignChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div
        className={`grid gap-2 ${options.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}
      >
        {options.map((option) => (
          <label
            key={option}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 py-3 text-sm capitalize transition-colors ${value === option ? "border-black bg-neutral-950 text-white" : "hover:bg-neutral-50"}`}
          >
            <input
              type="radio"
              name={label}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span className="peer-focus-visible:underline peer-focus-visible:underline-offset-4">
              {option}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
