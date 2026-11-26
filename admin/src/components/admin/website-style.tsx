"use client";
import "./website-style.scss";
import type { CSSProperties } from "react";
import { Select, SelectOption } from "@/components/ui/select";
import { siteFontVariables } from "@/components/builder/site-fonts";
import { canvasRootProps } from "@/components/builder/site-canvas-markup";
import { useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import { useProject } from "@/lib/builder/client";
import { sitePath } from "@/lib/builder/site-links";
import { useWorkspace } from "./site-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_FONT_PAIR,
  FONT_PAIRS,
  WEBSITE_FONTS,
  websiteFontFamily,
} from "@/lib/builder/font-pairs";
import {
  StylePresetFields,
  DesignSection,
  HeadingSizeField,
  applyLook,
  lookOf,
  type Look,
} from "./style-preset-fields";

// Per-website CSS: every website uses the same blocks, this gives it its own look.
export function WebsiteStyle() {
  const { project, error: loadError, save } = useProject();
  const workspace = useWorkspace();
  const [draft, setDraft] = useState<string | null>(null);
  const [fontDraft, setFontDraft] = useState<string | null>(null);
  const [lookDraft, setLookDraft] = useState<Look | null>(null);
  const [individualFonts, setIndividualFonts] = useState<{
    headingFont?: string;
    bodyFont?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (!project)
    return (
      <p className="text-sm text-neutral-500">{loadError || "Loading…"}</p>
    );
  const css = draft ?? project.customCss ?? "";
  const savedFonts = project.fonts || DEFAULT_FONT_PAIR;
  const fonts = fontDraft ?? savedFonts;
  const look = lookDraft ?? lookOf(project);
  const changed =
    css !== (project.customCss ?? "") ||
    fonts !== savedFonts ||
    lookDraft !== null ||
    individualFonts !== null;
  const home =
    project.pages.find((p) => p.id === project.layout.homePageId)?.slug ||
    "home";
  const preview = sitePath(workspace?.site?.key, home);
  const selectedFonts = individualFonts ?? {
    headingFont: project.brand.headingFont,
    bodyFont: project.brand.bodyFont,
  };
  const styled = applyLook(project, look);
  const sampleProject = {
    ...styled,
    fonts,
    brand: { ...styled.brand, ...selectedFonts },
  };
  const canvas = canvasRootProps(sampleProject);
  const sampleStyle = {
    ...canvas.style,
    fontFamily: "var(--font-body)",
    background: look.bg,
    color: look.ink,
    width: "100%",
    padding: 24,
    borderRadius: look.style.radius ?? 16,
  } as CSSProperties;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await save({
        ...(lookDraft ? applyLook(project, lookDraft) : project),
        brand: sampleProject.brand,
        customCss: css,
        fonts,
      });
      setDraft(null);
      setFontDraft(null);
      setLookDraft(null);
      setIndividualFonts(null);
      setNotice("Style saved. It is live on the public website.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the style.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <StylePresetFields
        typography={
          <DesignSection
            title="Typography"
            preview={
              <div
                {...canvas}
                className={`${siteFontVariables} site-canvas`}
                style={sampleStyle}
              >
                <p style={{ color: look.accent, fontSize: 12 }}>
                  YOUR NEXT CHAPTER
                </p>
                <h3
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight:
                      "var(--font-heading-weight)" as CSSProperties["fontWeight"],
                    fontSize: `calc(38px * var(--heading-scale, 1))`,
                    lineHeight: 1.1,
                    margin: "16px 0",
                  }}
                >
                  Good ideas deserve a great website.
                </h3>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: look.muted }}>
                  Thoughtful spaces for the way you work and live.
                </p>
                <p style={{ fontSize: 16, marginTop: 16 }}>
                  Сайт, в котором продумана каждая деталь.
                </p>
              </div>
            }
          >
            <div className="grid gap-2">
              <Label>Font pairing</Label>
              <Select
                aria-label="Font pairing"
                value={fonts}
                onValueChange={(value) => {
                  setFontDraft(value);
                  setIndividualFonts({
                    headingFont: undefined,
                    bodyFont: undefined,
                  });
                  setNotice("");
                }}
              >
                {FONT_PAIRS.map((pair) => (
                  <SelectOption key={pair.id} value={pair.id}>
                    {pair.label}
                  </SelectOption>
                ))}
              </Select>
            </div>
            {(["headingFont", "bodyFont"] as const).map((key) => (
              <div key={key} className="grid gap-2">
                <Label>
                  {key === "headingFont" ? "Heading font" : "Body font"}
                </Label>
                <Select
                  aria-label={
                    key === "headingFont" ? "Heading font" : "Body font"
                  }
                  value={selectedFonts[key] || "pair"}
                  onValueChange={(value) => {
                    setIndividualFonts({
                      ...selectedFonts,
                      [key]: value === "pair" ? undefined : value,
                    });
                    setNotice("");
                  }}
                >
                  <SelectOption value="pair">From font pairing</SelectOption>
                  {WEBSITE_FONTS.map(([id, label]) => (
                    <SelectOption key={id} value={id}>
                      <span
                        className={siteFontVariables}
                        style={{ fontFamily: websiteFontFamily(id) }}
                      >
                        {label} · Aa Бб
                      </span>
                    </SelectOption>
                  ))}
                </Select>
              </div>
            ))}
            <HeadingSizeField look={look} onChange={setLookDraft} />
          </DesignSection>
        }
        buttonPreview={
          <div
            {...canvas}
            className={`${siteFontVariables} site-canvas`}
            data-button-style={look.style.buttonStyle || "filled"}
            data-secondary-button-style={
              look.style.secondaryButtonStyle || "outline"
            }
            data-button-motion={look.style.buttonMotion || "fade"}
            data-secondary-button-motion={
              look.style.secondaryButtonMotion ||
              look.style.buttonMotion ||
              "fade"
            }
            style={sampleStyle}
          >
            <div className="space-y-6">
              <div>
                <p className="mb-3 text-xs" style={{ color: look.muted }}>
                  PRIMARY
                </p>
                <button type="button" className="design-button">
                  Discuss a project
                </button>
              </div>
              <div>
                <p className="mb-3 text-xs" style={{ color: look.muted }}>
                  SECONDARY
                </p>
                <button
                  type="button"
                  className="design-button design-button--secondary"
                >
                  Explore our work
                </button>
              </div>
              <p className="text-xs" style={{ color: look.muted }}>
                Hover over a button to preview its animation.
              </p>
            </div>
          </div>
        }
        look={look}
        onChange={(next, pairFonts) => {
          setLookDraft(next);
          if (pairFonts) {
            setFontDraft(pairFonts);
            setIndividualFonts({ headingFont: undefined, bodyFont: undefined });
          }
          setNotice("");
        }}
      />
      <details className="rounded-xl border bg-white p-6">
        <summary className="cursor-pointer text-sm font-semibold">
          Advanced · Custom CSS
        </summary>
        <div className="mt-5 grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="custom-css">Custom CSS</Label>
            <a
              href={preview}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-black"
            >
              Live preview <ExternalLink className="size-3.5" />
            </a>
          </div>
          <textarea
            id="custom-css"
            value={css}
            onChange={(e) => {
              setDraft(e.target.value);
              setNotice("");
            }}
            spellCheck={false}
            maxLength={100000}
            rows={22}
            placeholder={
              ".site-canvas {\n  --radius: 0;\n}\n.site-canvas h2 {\n  font-weight: 500;\n}"
            }
            aria-invalid={Boolean(error)}
            aria-describedby="custom-css-status"
            className="min-h-80 w-full rounded-xl bg-white p-4 font-mono text-[13px] leading-6 text-neutral-800 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] outline-none focus-visible:shadow-[0_0_0_2px_rgb(0_0_0/0.5)]"
          />
          <p className="text-xs text-neutral-400">
            {css.length.toLocaleString("en")} / 100,000 characters
          </p>
        </div>
      </details>
      <div id="custom-css-status">
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-3 text-sm">
            {notice}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !changed}>
          <Save /> Save style
        </Button>
        {changed && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(null);
              setFontDraft(null);
              setLookDraft(null);
              setIndividualFonts(null);
              setError("");
            }}
          >
            Discard changes
          </Button>
        )}
      </div>
    </form>
  );
}
