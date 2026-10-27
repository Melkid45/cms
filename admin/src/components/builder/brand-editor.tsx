"use client";
import { useState, useRef } from "react";
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
  const [brand, setBrand] = useState(project.brand),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
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
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await save({ ...project, brand });
          setNotice("Brand saved. Logo and colors now apply to every page.");
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Website identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2">
            <Label htmlFor="brand-name">Project name</Label>
            <Input
              id="brand-name"
              value={brand.name}
              onChange={(e) => setBrand({ ...brand, name: e.target.value })}
            />
          </div>
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
            <p className="text-xs text-neutral-500">
              Leave empty to use the header logo. Useful for a light logo on a
              dark footer.
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Website palette</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          {(["primary", "secondary", "alternative"] as const).map((key) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`color-${key}`}>
                {key === "primary"
                  ? "Text & buttons"
                  : key === "secondary"
                    ? "Background"
                    : "Accent"}
              </Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label={`${key} color picker`}
                  value={
                    /^#[a-f\d]{6}$/i.test(brand[key]) ? brand[key] : "#000000"
                  }
                  onChange={(e) =>
                    setBrand({ ...brand, [key]: e.target.value })
                  }
                  className="h-10 w-12 rounded border bg-transparent"
                />
                <Input
                  id={`color-${key}`}
                  value={brand[key]}
                  pattern="#[a-fA-F0-9]{6}"
                  required
                  onChange={(e) =>
                    setBrand({ ...brand, [key]: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {/^#[a-f\d]{6}$/i.test(brand.primary) &&
        /^#[a-f\d]{6}$/i.test(brand.secondary) && (
          <p className="text-xs text-neutral-500">
            Text / background contrast:{" "}
            {contrastRatio(brand.primary, brand.secondary)?.toFixed(1)}:1
            {(contrastRatio(brand.primary, brand.secondary) ?? 0) < 4.5
              ? " · Choose stronger contrast for readable body text."
              : ""}
          </p>
        )}
      <div className="flex items-center gap-5">
        <Button type="submit" disabled={busy}>
          <Save />
          {busy ? "Saving…" : "Save brand"}
        </Button>
        <p role="status" className="text-sm">
          {notice}
        </p>
      </div>
    </form>
  );
}
