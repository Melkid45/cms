"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ImageIcon, LoaderCircle, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Color from "@/components/custom/color";
import { loadBrandSettings, saveBrandSettings } from "@/lib/brand-storage";
import {
  analyzeLogo,
  contrastRatio,
  DEFAULT_BRAND_PALETTE,
  type BrandPalette,
  LogoValidationError,
  normalizeHexColor,
} from "@/lib/image-colors";

type PaletteKey = keyof BrandPalette;

interface LogoDimensions {
  width: number;
  height: number;
}

type FormState =
  | { kind: "idle"; message: "" }
  | { kind: "loading" | "analyzing" | "saving"; message: string }
  | { kind: "saved" | "success"; message: string }
  | { kind: "error"; message: string };

const COLOR_FIELDS: Array<{ key: PaletteKey; label: string; description: string }> = [
  { key: "primary", label: "Primary color", description: "Main actions and strong brand surfaces" },
  { key: "secondary", label: "Secondary color", description: "Supporting surfaces and contrast" },
  { key: "alternative", label: "Alternative color", description: "Accents and optional highlights" },
];

export function SetupForm() {
  const picker = useRef<HTMLInputElement>(null);
  const analysisRequest = useRef(0);
  const logoUrlReference = useRef<string | null>(null);
  const [logo, setLogo] = useState<Blob | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoType, setLogoType] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoDimensions, setLogoDimensions] = useState<LogoDimensions | null>(null);
  const [palette, setPalette] = useState<Record<PaletteKey, string>>(DEFAULT_BRAND_PALETTE);
  const [state, setState] = useState<FormState>({ kind: "loading", message: "Loading saved brand settings…" });

  const updateLogoPreview = useCallback((blob: Blob | null) => {
    if (logoUrlReference.current) URL.revokeObjectURL(logoUrlReference.current);

    const nextUrl = blob ? URL.createObjectURL(blob) : null;
    logoUrlReference.current = nextUrl;
    setLogo(blob);
    setLogoUrl(nextUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadBrandSettings()
      .then((settings) => {
        if (cancelled) return;

        if (settings) {
          updateLogoPreview(settings.logo);
          setLogoName(settings.logoName);
          setLogoType(settings.logoType);
          setLogoDimensions(
            settings.logoWidth && settings.logoHeight
              ? { width: settings.logoWidth, height: settings.logoHeight }
              : null,
          );
          setPalette(settings.palette);
        }
        setState({ kind: "idle", message: "" });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: "Saved brand settings could not be loaded. You can still edit and try saving again.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [updateLogoPreview]);

  useEffect(() => {
    return () => {
      if (logoUrlReference.current) URL.revokeObjectURL(logoUrlReference.current);
    };
  }, []);

  const normalizedPalette = normalizePalette(palette);
  const primarySecondaryContrast = normalizedPalette
    ? contrastRatio(normalizedPalette.primary, normalizedPalette.secondary)
    : null;
  const isBusy = state.kind === "loading" || state.kind === "analyzing" || state.kind === "saving";

  async function handleLogoChange(file: File | undefined) {
    if (!file) return;

    const requestId = ++analysisRequest.current;
    setState({ kind: "analyzing", message: "Checking the logo and extracting its colors…" });

    try {
      const analysis = await analyzeLogo(file);
      if (requestId !== analysisRequest.current) return;

      updateLogoPreview(analysis.file);
      setLogoName(analysis.file.name);
      setLogoType(analysis.file.type);
      setLogoDimensions({ width: analysis.width, height: analysis.height });
      setPalette(analysis.palette);
      setState({
        kind: "success",
        message: "The logo is ready and its most useful colors were added below. You can adjust them before saving.",
      });
    } catch (error) {
      if (requestId !== analysisRequest.current) return;
      setState({
        kind: "error",
        message: error instanceof LogoValidationError ? error.message : "The logo could not be processed.",
      });
    } finally {
      if (picker.current) picker.current.value = "";
    }
  }

  function removeLogo() {
    analysisRequest.current += 1;
    updateLogoPreview(null);
    setLogoName(null);
    setLogoType(null);
    setLogoDimensions(null);
    if (picker.current) picker.current.value = "";
    setState({ kind: "success", message: "The logo was removed. Save the settings to confirm this change." });
  }

  function updateColor(key: PaletteKey, value: string) {
    setPalette((current) => ({ ...current, [key]: value.toUpperCase() }));
    if (state.kind === "saved") setState({ kind: "idle", message: "" });
  }

  function normalizeColorField(key: PaletteKey) {
    const normalized = normalizeHexColor(palette[key]);
    if (normalized) updateColor(key, normalized);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validPalette = normalizePalette(palette);

    if (!validPalette) {
      setState({ kind: "error", message: "Enter every color as a three- or six-digit hex value." });
      return;
    }

    setPalette(validPalette);
    setState({ kind: "saving", message: "Saving logo and brand colors…" });

    try {
      await saveBrandSettings({
        logo,
        logoName,
        logoType,
        logoWidth: logoDimensions?.width ?? null,
        logoHeight: logoDimensions?.height ?? null,
        palette: validPalette,
        updatedAt: new Date().toISOString(),
      });
      window.dispatchEvent(new CustomEvent("harbstone:brand-updated"));
      setState({ kind: "saved", message: "Brand settings saved on this device." });
    } catch {
      setState({
        kind: "error",
        message: "The browser could not save the brand settings. Check private browsing or storage permissions.",
      });
    }
  }

  return (
    <form className="space-y-5" onSubmit={save}>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Website logo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div className="relative flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[linear-gradient(45deg,#f5f5f5_25%,transparent_25%),linear-gradient(-45deg,#f5f5f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f5f5f5_75%),linear-gradient(-45deg,transparent_75%,#f5f5f5_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] p-3">
            {logoUrl ? (
              <Image src={logoUrl} alt="Website logo preview" width={160} height={80} unoptimized className="size-full object-contain" />
            ) : (
              <ImageIcon className="size-5 text-neutral-300" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium">{logoName ?? "Upload your website logo"}</p>
            <p className="mt-2 text-sm leading-5 text-neutral-400">
              PNG, JPEG, WebP, or safe SVG · up to 5 MB
              {logoDimensions
                ? ` · ${logoDimensions.width} × ${logoDimensions.height} px`
                : ""}
            </p>
          </div>

          <input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
            className="hidden"
            onChange={(event) => void handleLogoChange(event.target.files?.[0])}
          />

          <div className="flex shrink-0 gap-2">
            {logo && (
              <Button type="button" variant="ghost" size="lg" disabled={isBusy} onClick={removeLogo}>
                <Trash2 data-icon="inline-start" /> Remove
              </Button>
            )}
            <Button type="button" variant="outline" size="lg" disabled={isBusy} onClick={() => picker.current?.click()}>
              {state.kind === "analyzing" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Camera data-icon="inline-start" />}
              {logo ? "Replace" : "Upload"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Brand colors</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-3">
          {COLOR_FIELDS.map(({ key, label, description }) => {
            const normalized = normalizeHexColor(palette[key]);
            const fieldId = `brand-${key}`;

            return (
              <div className="grid content-start gap-2" key={key}>
                <Label htmlFor={fieldId}>{label}</Label>
                <div className="flex gap-2">
                  <Color
                    value={normalized ?? DEFAULT_BRAND_PALETTE[key]}
                    label={`Choose ${label.toLowerCase()}`}
                    disabled={isBusy}
                    onChange={(value) => updateColor(key, value)}
                  />
                  <Input
                    id={fieldId}
                    value={palette[key]}
                    maxLength={7}
                    spellCheck={false}
                    autoComplete="off"
                    disabled={isBusy}
                    aria-invalid={!normalized}
                    onBlur={() => normalizeColorField(key)}
                    onChange={(event) => updateColor(key, event.target.value)}
                    className="font-mono uppercase"
                  />
                </div>
                <p className="text-xs leading-5 text-neutral-400">{description}</p>
              </div>
            );
          })}

          <div className="sm:col-span-3">
            <p className="text-xs text-neutral-400">
              Primary and secondary contrast: {primarySecondaryContrast ? `${primarySecondaryContrast.toFixed(1)}:1` : "invalid colors"}
              {primarySecondaryContrast ? (primarySecondaryContrast >= 4.5 ? " · suitable for normal text" : " · use carefully for text") : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          className={state.kind === "error" ? "text-sm text-destructive" : "text-sm text-neutral-500"}
          role={state.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {state.message}
        </p>
        <Button type="submit" size="lg" disabled={isBusy || !normalizedPalette}>
          {state.kind === "saving" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : state.kind === "saved" ? <Check data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          {state.kind === "saving" ? "Saving" : state.kind === "saved" ? "Saved" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

function normalizePalette(palette: Record<PaletteKey, string>): BrandPalette | null {
  const primary = normalizeHexColor(palette.primary);
  const secondary = normalizeHexColor(palette.secondary);
  const alternative = normalizeHexColor(palette.alternative);

  if (!primary || !secondary || !alternative) return null;
  return { primary, secondary, alternative };
}
