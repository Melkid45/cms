"use client";
import { useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import { useProject } from "@/lib/builder/client";
import { sitePath } from "@/lib/builder/site-links";
import { useWorkspace } from "./site-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DEFAULT_FONT_PAIR, FONT_PAIRS } from "@/lib/builder/font-pairs";
import {
  StylePresetFields,
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
    lookDraft !== null;
  const home =
    project.pages.find((p) => p.id === project.layout.homePageId)?.slug ||
    "home";
  const preview = sitePath(workspace?.site?.key, home);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await save({
        ...(lookDraft ? applyLook(project, lookDraft) : project),
        customCss: css,
        fonts,
      });
      setDraft(null);
      setFontDraft(null);
      setLookDraft(null);
      setNotice("Style saved. It is live on the public website.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the style.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-xl bg-white p-5 text-sm leading-6 text-neutral-600">
        <p>
          All websites are built from the same blocks. This CSS gives{" "}
          <strong className="text-black">
            {workspace?.site?.name || project.brand.name}
          </strong>{" "}
          its own look without changing the blocks themselves.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Start every rule with <code>.site-canvas</code> so it only touches
            this website, for example{" "}
            <code>.site-canvas h1 {"{ letter-spacing: -0.02em; }"}</code>
          </li>
          <li>
            No <code>@import</code>, scripts or external images; images must
            come from this website (<code>url(/…)</code>).
          </li>
          <li>Saved changes go live right away, also on published pages.</li>
        </ul>
      </div>
      <StylePresetFields
        look={look}
        onChange={(next, pairFonts) => {
          setLookDraft(next);
          if (pairFonts) setFontDraft(pairFonts);
          setNotice("");
        }}
      />
      <div className="grid gap-2">
        <Label htmlFor="font-pair">Fonts (headings + text)</Label>
        <select
          id="font-pair"
          value={fonts}
          onChange={(e) => {
            setFontDraft(e.target.value);
            setNotice("");
          }}
          className="h-10 w-full max-w-md rounded-xl bg-white px-3 text-sm shadow-[0_0_0_1px_rgb(0_0_0/0.06)] outline-none focus-visible:shadow-[0_0_0_2px_rgb(0_0_0/0.5)]"
        >
          {FONT_PAIRS.map((pair) => (
            <option key={pair.id} value={pair.id}>
              {pair.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
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
