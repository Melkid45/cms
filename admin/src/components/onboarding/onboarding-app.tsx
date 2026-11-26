"use client";
import { Select, SelectOption } from "@/components/ui/select";
// Onboarding autopilot UI (lib/builder/onboarding): one screen for the client (private link,
// /onboarding/[id]) and for the team or the website's client account (/dashboard/onboarding/[id]).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SiteFrame } from "@/components/builder/site-frame";
import { SiteContext } from "@/components/admin/site-context";
import type { Site } from "@/lib/builder/sites";
import type { Project } from "@/lib/builder/types";
import {
  LANGUAGE_OPTIONS,
  NICHES,
  PAGE_TYPES,
  PLACEHOLDER,
  STEPS,
  type Brief,
  type OnboardingView,
  type ReviewItem,
} from "@/lib/builder/onboarding/shared";
import { VoiceButton } from "./voice-button";
import { setCurrentSite } from "@/lib/builder/site-client";
import {
  browserLang,
  CONSULT_LANG_LABEL,
  CONSULT_LANGS,
  type ConsultLang,
  message,
  optionLabel,
  ui,
} from "@/lib/builder/onboarding/i18n";

type View = OnboardingView & { viewer: "customer" | "team" | "client"; token?: string };
export const surface = "rounded-2xl bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgb(0_0_0/0.06),0_8px_24px_rgb(0_0_0/0.04)]";
const chip = (on: boolean) =>
  cn(
    "h-9 rounded-full px-3.5 text-sm font-medium transition-shadow",
    on ? "bg-[#1d1d1b] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
  );
const LANG = Object.fromEntries(LANGUAGE_OPTIONS.map((l) => [l.id, l.label]));

function readToken(id: string) {
  const hash = new URLSearchParams(window.location.hash.slice(1)).get("t");
  const key = `harbstone-onboarding:${id}`;
  try {
    if (hash) localStorage.setItem(key, hash);
    return hash || localStorage.getItem(key);
  } catch {
    return hash;
  }
}

export function OnboardingApp({ id, mode }: { id: string; mode: "customer" | "dashboard" }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [projectVersion, setProjectVersion] = useState(0);

  const call = useCallback(
    async <T,>(path: string, init: { method?: string; json?: unknown; body?: BodyInit; type?: string } = {}) => {
      const headers: Record<string, string> = {};
      if (token) headers["x-onboarding-token"] = token;
      if (init.json !== undefined) headers["Content-Type"] = "application/json";
      if (init.type) headers["Content-Type"] = init.type;
      const response = await fetch(path, {
        method: init.method || "GET",
        headers,
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
        cache: "no-store",
      }).catch(() => {
        throw new Error("No connection. Check your internet and try again.");
      });
      const data = (await response.json().catch(() => ({}))) as T & { error?: string };
      if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      return data as T;
    },
    [token],
  );

  useEffect(() => {
    queueMicrotask(() => setToken(mode === "customer" ? readToken(id) : null));
  }, [id, mode]);
  useEffect(() => {
    if (token === undefined) return;
    if (mode === "customer" && !token) {
      queueMicrotask(() => setError("Open this page with the private link you received."));
      return;
    }
    call<View>(`/api/onboarding/${id}`).then(setView, (e: Error) => setError(e.message));
  }, [call, id, mode, token]);

  const act = useCallback(
    async (body: Record<string, unknown>, label = "Saving…") => {
      setBusy(label);
      setError("");
      try {
        const next = await call<View>(`/api/onboarding/${id}`, { method: "POST", json: body });
        setView(next);
        setProjectVersion((v) => v + 1);
        return next;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        return null;
      } finally {
        setBusy("");
      }
    },
    [call, id],
  );
  const transcribe = useCallback(
    async (wav: Blob) => {
      const data = await call<{ text: string }>(`/api/onboarding/${id}/voice`, { method: "POST", body: wav, type: "audio/wav" });
      return data.text;
    },
    [call, id],
  );

  // No consultation language yet (record started without one): take the browser language.
  const needsLang = !!view && !view.lang && view.step === "consultation";
  useEffect(() => {
    if (needsLang)
      queueMicrotask(() => void act({ action: "lang", lang: browserLang(navigator.languages ?? [navigator.language]) }));
  }, [needsLang, act]);

  if (!view)
    return (
      <div className="py-16">
        {error ? (
          <div className={surface}>
            <h1 className="text-xl font-semibold">We could not open this page</h1>
            <p className="mt-1 text-neutral-600">{error}</p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-neutral-500">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        )}
      </div>
    );

  const context = {
    site: { id: view.siteId, key: view.siteKey, name: view.siteName, companyId: view.companyId, createdAt: view.createdAt } as Site,
    companies: [],
    sites: [],
  };
  return (
    <SiteContext.Provider value={context}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <Tracker view={view} />
        {view.test && (
          <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            Test website{view.mock ? " · AI answers are simulated (no cost)" : ""} · never published to search engines.
          </p>
        )}
        {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
        {view.step === "consultation" && (
          <Consultation view={view} act={act} busy={busy} transcribe={transcribe} call={call} onView={setView} />
        )}
        {view.step === "draft" && (
          <div className={surface}>
            <h2 className="text-lg font-semibold">Your draft website</h2>
            {busy ? (
              <p className="mt-2 flex items-center gap-2 text-neutral-600">
                <Loader2 className="size-4 animate-spin" /> {busy}
              </p>
            ) : (
              <>
                <p className="mt-1 text-neutral-600">The brief is confirmed. Build the first version of the website.</p>
                <Button size="lg" className="mt-4 h-10 px-4" onClick={() => act({ action: "build" }, "Writing your pages… this takes about a minute.")}>
                  Build my website <ArrowRight />
                </Button>
              </>
            )}
          </div>
        )}
        {["review", "translation", "live"].includes(view.step) && (
          <Review view={view} act={act} busy={busy} transcribe={transcribe} call={call} version={projectVersion} />
        )}
        {mode === "dashboard" && view.viewer === "team" && <TeamPanel view={view} act={act} />}
      </div>
    </SiteContext.Provider>
  );
}

function Tracker({ view }: { view: View }) {
  const reached = STEPS.findIndex((s) => s.id === view.step);
  return (
    <ol className="grid grid-cols-5 gap-1.5 sm:gap-3" aria-label="Progress">
      {STEPS.map((step, index) => {
        const done = index < reached || view.step === "live";
        const now = index === reached && view.step !== "live";
        return (
          <li key={step.id} className="min-w-0" aria-current={now ? "step" : undefined}>
            <span className={cn("block h-1.5 rounded-full", done ? "bg-[#1d1d1b]" : now ? "bg-[#1d1d1b]/50" : "bg-neutral-200")} />
            <span className={cn("mt-2 block truncate text-xs sm:text-sm", now || done ? "font-medium text-neutral-900" : "text-neutral-500")}>
              {ui(view.lang, step.label as "Consultation")}
            </span>
            {now && <span className="mt-0.5 hidden text-xs text-neutral-500 sm:block">{ui(view.lang, `step.${step.id}` as "step.draft")}</span>}
          </li>
        );
      })}
    </ol>
  );
}

type Act = (body: Record<string, unknown>, label?: string) => Promise<View | null>;
type Call = <T>(path: string, init?: { method?: string; json?: unknown; body?: BodyInit; type?: string }) => Promise<T>;

// ---- Consultation ----
function Consultation({
  view,
  act,
  busy,
  transcribe,
  call,
  onView,
}: {
  view: View;
  act: Act;
  busy: string;
  transcribe: (wav: Blob) => Promise<string>;
  call: Call;
  onView: (view: View) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [view.messages.length, view.question?.topic, view.brief]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={ui(view.lang, "Language of the consultation")}>
        {CONSULT_LANGS.map((code) => (
          <button
            key={code}
            className={chip(view.lang === code)}
            disabled={!!busy || view.lang === code}
            onClick={() => act({ action: "lang", lang: code })}
          >
            {CONSULT_LANG_LABEL[code]}
          </button>
        ))}
      </div>
      <div className={cn(surface, "grid gap-3")}>
        {view.messages.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.text} voice={m.via === "voice" ? ui(view.lang, "voice") : undefined} />
        ))}
        {view.question && <Bubble role="assistant" text={view.question.text} hint={view.question.hint} />}
        {!view.question && !view.brief && (
          <Bubble role="assistant" text={ui(view.lang, "all.done")} />
        )}
        <div ref={end} />
      </div>
      {view.question ? (
        <QuestionBox key={view.question.topic} view={view} act={act} busy={busy} transcribe={transcribe} call={call} onView={onView} />
      ) : view.brief ? (
        <BriefEditor view={view} act={act} busy={busy} />
      ) : (
        <div className={surface}>
          <Button size="lg" className="h-10 px-4" disabled={!!busy} onClick={() => act({ action: "brief" }, ui(view.lang, "Writing your brief…"))}>
            {busy ? <Loader2 className="animate-spin" /> : null} {busy || ui(view.lang, "Write my brief")}
          </Button>
        </div>
      )}
    </div>
  );
}
function Bubble({ role, text, hint, voice }: { role: "assistant" | "customer"; text: string; hint?: string; voice?: string }) {
  return (
    <div className={cn("flex", role === "customer" && "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap",
          role === "assistant" ? "bg-[#f3f2ee] text-neutral-900" : "bg-[#1d1d1b] text-white",
        )}
      >
        {text}
        {hint && <span className="mt-1 block text-sm text-neutral-500">{hint}</span>}
        {voice && <span className="mt-1 block text-xs opacity-60">{voice}</span>}
      </div>
    </div>
  );
}
function QuestionBox({
  view,
  act,
  busy,
  transcribe,
  call,
  onView,
}: {
  view: View;
  act: Act;
  busy: string;
  transcribe: (wav: Blob) => Promise<string>;
  call: Call;
  onView: (view: View) => void;
}) {
  const q = view.question!;
  const [text, setText] = useState("");
  const [via, setVia] = useState<"text" | "voice">("text");
  const [picked, setPicked] = useState<string[]>([]);
  const [uploading, setUploading] = useState("");
  const lang: ConsultLang = view.lang ?? "en";
  const label = (value: string, index: number) => q.optionLabels?.[index] ?? optionLabel(lang, value);
  const send = (value: string) => act({ action: "answer", topic: q.topic, text: value, via }, ui(lang, "Saving…"));
  const skip = q.optional && (
    <Button variant="ghost" size="lg" className="h-10 px-4" disabled={!!busy} onClick={() => send("")}>
      {ui(lang, "Skip")}
    </Button>
  );
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const [n, file] of [...files].entries()) {
      setUploading(`Uploading ${n + 1} of ${files.length}…`);
      const form = new FormData();
      form.append("file", file);
      try {
        await call(`/api/onboarding/${view.id}/photo`, { method: "POST", body: form });
      } catch (e) {
        setUploading(e instanceof Error ? e.message : "Upload failed.");
        return;
      }
    }
    setUploading("");
    onView(await call<View>(`/api/onboarding/${view.id}`));
  }
  return (
    <div className={cn(surface, "grid gap-3")}>
      {q.suggestion && (
        <div className="rounded-xl bg-[#f3f2ee] p-4 text-sm">
          <p className="font-medium">{ui(lang, "From your website:")}</p>
          <p className="mt-1 whitespace-pre-wrap text-neutral-700">{q.suggestion}</p>
          <Button variant="secondary" className="mt-3" onClick={() => setText(q.suggestion!)}>
            {ui(lang, "Use this")}
          </Button>
        </div>
      )}
      {(q.kind === "text" || q.kind === "textarea") && (
        <>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setVia("text");
            }}
            rows={q.kind === "textarea" ? 4 : 2}
            placeholder={ui(lang, "Your answer")}
            className="bg-white text-[15px]"
          />
          <div className="flex flex-wrap items-start gap-2">
            <Button size="lg" className="h-10 px-4" disabled={!!busy || !text.trim()} onClick={() => send(text)}>
              {busy ? <Loader2 className="animate-spin" /> : null} {ui(lang, "Send")}
            </Button>
            <VoiceButton
              lang={lang}
              send={transcribe}
              disabled={!!busy}
              onText={(value) => {
                setText((current) => (current ? `${current}\n${value}` : value));
                setVia("voice");
              }}
            />
            {skip}
          </div>
        </>
      )}
      {q.kind === "choice" && (
        <div className="flex flex-wrap gap-2">
          {q.options?.map((option, index) => (
            <button key={option} className={chip(false)} disabled={!!busy} onClick={() => send(option)}>
              {label(option, index)}
            </button>
          ))}
          {skip}
        </div>
      )}
      {q.kind === "multi" && (
        <>
          <div className="flex flex-wrap gap-2">
            {q.options?.map((option, index) => (
              <button
                key={option}
                className={chip(picked.includes(option))}
                onClick={() => setPicked((p) => (p.includes(option) ? p.filter((x) => x !== option) : [...p, option]))}
              >
                {picked.includes(option) && <Check className="mr-1 inline size-3.5" />}
                {label(option, index)}
                {q.topic === "languages" && picked[0] === option && <span className="ml-1 opacity-70">({ui(lang, "main")})</span>}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="lg" className="h-10 px-4" disabled={!!busy || (!picked.length && !q.optional && q.topic !== "pages")} onClick={() => send(picked.join(", "))}>
              {ui(lang, "Continue")}
            </Button>
            {skip}
          </div>
        </>
      )}
      {q.kind === "photos" && (
        <>
          {view.photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {view.photos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
              ))}
            </div>
          )}
          <label className={cn(chip(false), "inline-flex w-fit cursor-pointer items-center gap-2")}>
            <Upload className="size-4" /> {ui(lang, "Add photos")}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
          </label>
          {uploading && <p className="text-sm text-neutral-600">{uploading}</p>}
          <div className="flex gap-2">
            <Button size="lg" className="h-10 px-4" disabled={!!busy || !!uploading || !view.photos.length} onClick={() => send(message(lang, "photos", { n: view.photos.length }))}>
              {ui(lang, "Continue")}
            </Button>
            {skip}
          </div>
        </>
      )}
      {q.kind === "link" && (
        <>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="url"
            placeholder="https://"
            className="h-11 w-full rounded-lg bg-white px-3 text-[15px] shadow-[0_0_0_1px_rgb(0_0_0/0.12)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="h-10 px-4"
              disabled={!!busy || text.trim().length < 4}
              onClick={() => act({ action: "import", url: text.trim() }, ui(lang, "Reading your website…"))}
            >
              {busy ? <Loader2 className="animate-spin" /> : null} {busy || ui(lang, "Read my website")}
            </Button>
            {skip}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Brief ----
const lines = (value: string) => value.split("\n").map((s) => s.trim()).filter(Boolean);
function BriefEditor({ view, act, busy }: { view: View; act: Act; busy: string }) {
  const [brief, setBrief] = useState<Brief>(view.brief!);
  const [offers, setOffers] = useState(
    view.brief!.offers.map((o) => [o.name, o.price, o.description, o.category].join(" | ")).join("\n"),
  );
  const t = (key: Parameters<typeof ui>[1]) => ui(view.lang, key);
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) => setBrief((b) => ({ ...b, [key]: value }));
  const payload = () => ({
    ...brief,
    offers: lines(offers).map((line) => {
      const [name = "", price = "", description = "", category = ""] = line.split("|").map((s) => s.trim());
      return { name: name || line, price, description, category };
    }),
  });
  const area = (label: string, key: keyof Brief, rows = 2, hint?: string) => (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Textarea
        rows={rows}
        value={Array.isArray(brief[key]) ? (brief[key] as string[]).join("\n") : String(brief[key] ?? "")}
        onChange={(e) => set(key, (Array.isArray(brief[key]) ? lines(e.target.value) : e.target.value) as never)}
        className="bg-white"
      />
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  );
  return (
    <div className={cn(surface, "grid gap-4")}>
      <div>
        <h2 className="text-lg font-semibold">{t("Your brief")}</h2>
        <p className="text-sm text-neutral-600">{t("brief.lead")}</p>
      </div>
      {brief.unknowns.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">{t("brief.missing")}</p>
          <ul className="mt-1 list-disc pl-5">
            {brief.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {area(t("Business name"), "business", 1)}
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{t("Type of business")}</span>
          <Select value={String(brief.niche)} onValueChange={(selectedValue) => set("niche", selectedValue as Brief["niche"])} className="h-9 ">
            {Object.entries(NICHES).map(([id, n]) => (
              <SelectOption key={id} value={String(id)}>
                {optionLabel(view.lang ?? "en", n.label)}
              </SelectOption>
            ))}
          </Select>
        </label>
      </div>
      {area(t("About the business"), "summary", 3)}
      {area(t("Customers"), "audience", 2)}
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">{t("Services / products")}</span>
        <Textarea rows={6} value={offers} onChange={(e) => setOffers(e.target.value)} className="bg-white font-mono text-[13px]" />
        <span className="text-xs text-neutral-500">{t("offers.hint")}</span>
      </label>
      {area(t("Why customers choose you"), "unique", 3, t("unique.hint"))}
      <div className="grid gap-4 sm:grid-cols-2">
        {area(t("Tone"), "tone", 1)}
        {area(t("Colours"), "colors", 1)}
        {area(t("Phone"), "phone", 1)}
        {area(t("E-mail"), "email", 1)}
        {area(t("Address"), "address", 1)}
        {area(t("Opening hours"), "hours", 2)}
      </div>
      {area(t("Social links"), "social", 2, t("social.hint"))}
      <div className="grid gap-2 text-sm">
        <span className="font-medium">{t("Languages (first = main)")}</span>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((l) => (
            <button
              key={l.id}
              className={chip(brief.languages.includes(l.id))}
              onClick={() =>
                set(
                  "languages",
                  brief.languages.includes(l.id)
                    ? brief.languages.length > 1
                      ? brief.languages.filter((x) => x !== l.id)
                      : brief.languages
                    : [...brief.languages, l.id],
                )
              }
            >
              {optionLabel(view.lang ?? "en", l.label)}
              {brief.languages[0] === l.id && <span className="ml-1 opacity-70">({t("main")})</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 text-sm">
        <span className="font-medium">{t("Pages")}</span>
        <div className="flex flex-wrap gap-2">
          {PAGE_TYPES.map((p) => (
            <button
              key={p.id}
              disabled={p.id === "home"}
              className={chip(brief.pages.includes(p.id))}
              onClick={() =>
                set("pages", brief.pages.includes(p.id) ? brief.pages.filter((x) => x !== p.id) : [...brief.pages, p.id])
              }
            >
              {optionLabel(view.lang ?? "en", p.id === "prices" && NICHES[brief.niche]?.menuName ? NICHES[brief.niche].menuName! : p.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="lg" className="h-10 px-4" disabled={!!busy} onClick={() => act({ action: "save-brief", brief: payload() })}>
          {t("Save changes")}
        </Button>
        <Button
          size="lg"
          className="h-10 px-4"
          disabled={!!busy}
          onClick={async () => {
            const saved = await act({ action: "save-brief", brief: payload() });
            if (saved) await act({ action: "confirm-brief" }, t("Building your website… this takes about a minute."));
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : null} {busy || t("Confirm and build my website")}
        </Button>
      </div>
    </div>
  );
}

// ---- Review ----
function Review({
  view,
  act,
  busy,
  transcribe,
  call,
  version,
}: {
  view: View;
  act: Act;
  busy: string;
  transcribe: (wav: Blob) => Promise<string>;
  call: Call;
  version: number;
}) {
  const [project, setProject] = useState<Project | null>(null);
  // ?item=<review item> (link from the approvals list / Telegram) opens that block.
  const [selected, setSelected] = useState<string | null>(() => {
    const item = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("item") : null;
    return item && view.review.some((i) => i.id === item) ? item : null;
  });
  const [pageId, setPageId] = useState(
    () => view.review.find((i) => i.id === selected)?.pageId ?? view.pages[0]?.pageId ?? "",
  );
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const [comment, setComment] = useState("");
  const [via, setVia] = useState<"text" | "voice">("text");
  useEffect(() => {
    call<Project>(`/api/onboarding/${view.id}/project`).then(setProject, () => undefined);
  }, [call, view.id, version]);
  const page = project?.pages.find((p) => p.id === pageId);
  const items = view.review.filter((i) => i.pageId === pageId);
  const item = view.review.find((i) => i.id === selected) ?? null;
  const placeholders = useMemo(
    () => [...new Set(JSON.stringify(page?.sections ?? []).match(PLACEHOLDER) ?? [])],
    [page],
  );
  const main = view.plan?.main ?? "";
  const ready = view.review.length > 0 && view.review.every((i) => i.status === "approved");
  const left = view.review.filter((i) => i.status !== "approved").length;
  const otherLanguages = (view.brief?.languages ?? []).filter((l) => l !== main && !view.translations.includes(l));
  const [langs, setLangs] = useState<string[]>(otherLanguages);
  const status = (i: ReviewItem) =>
    i.status === "approved" ? "Approved" : i.version > 1 ? `Rewritten (v${i.version})` : "Waiting for you";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {view.step === "live" && (
        <div className={surface}>
          <h2 className="text-lg font-semibold">Your website is live</h2>
          <Link href={`/site/${view.siteKey}/home`} target="_blank" className="mt-2 inline-flex items-center gap-1.5 font-medium underline underline-offset-4">
            Open the website <ExternalLink className="size-4" />
          </Link>
        </div>
      )}
      {view.step === "translation" && (
        <div className={surface}>
          {otherLanguages.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold">Translate the website</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Main language: {LANG[main] ?? main}. Choose the languages to add — the approved texts are translated, then you check them the same way.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.filter((l) => l.id !== main && !view.translations.includes(l.id)).map((l) => (
                  <button key={l.id} className={chip(langs.includes(l.id))} onClick={() => setLangs((x) => (x.includes(l.id) ? x.filter((y) => y !== l.id) : [...x, l.id]))}>
                    {l.label}
                  </button>
                ))}
              </div>
              <Button size="lg" className="mt-4 h-10 px-4" disabled={!!busy || !langs.length} onClick={() => act({ action: "translate", locales: langs }, "Translating… about a minute per language.")}>
                {busy ? <Loader2 className="animate-spin" /> : null} {busy || "Translate"}
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{ready ? "Ready to publish" : `${left} block${left === 1 ? "" : "s"} left to approve`}</h2>
              <p className="mt-1 text-sm text-neutral-600">
                {ready ? "Every block in every language is approved." : "Approve the translated blocks below, then publish."}
              </p>
              {ready && !(view.test && view.viewer === "customer") && (
                <Button size="lg" className="mt-4 h-10 px-4" disabled={!!busy} onClick={() => act({ action: "publish" }, "Publishing…")}>
                  {busy ? <Loader2 className="animate-spin" /> : null} {busy || "Publish the website"}
                </Button>
              )}
              {ready && view.test && <p className="mt-2 text-sm text-neutral-500">Test website: the team decides about publishing.</p>}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {view.pages.map((p) => (
          <button
            key={p.pageId}
            className={chip(p.pageId === pageId)}
            onClick={() => {
              setPageId(p.pageId);
              setSelected(null);
            }}
          >
            {p.title}
            {p.locale !== main && <span className="ml-1 opacity-70">{p.locale.toUpperCase()}</span>}
          </button>
        ))}
        <span className="ml-auto hidden gap-1 sm:flex">
          {(["desktop", "phone"] as const).map((w) => (
            <button key={w} className={chip(width === w)} onClick={() => setWidth(w)}>
              {w === "desktop" ? "Desktop" : "Phone"}
            </button>
          ))}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgb(0_0_0/0.06),0_8px_24px_rgb(0_0_0/0.04)]">
          {project && page ? (
            <div className="flex justify-center bg-neutral-100">
              <SiteFrame
                project={project}
                sections={page.sections}
                locale={page.locale}
                width={width === "phone" ? "390px" : "100%"}
                className="h-[75vh] max-h-[880px] min-h-[520px]"
                onSelectSection={(sectionId) => {
                  const found = view.review.find((i) => i.pageId === page.id && i.sectionId === sectionId);
                  if (found) {
                    setSelected(found.id);
                    setComment("");
                  }
                }}
              />
            </div>
          ) : (
            <p className="flex items-center gap-2 p-6 text-neutral-500">
              <Loader2 className="size-4 animate-spin" /> Loading the preview…
            </p>
          )}
        </div>

        <aside className="grid content-start gap-4">
          {item ? (
            <div className={cn(surface, "grid gap-3")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{item.label}</h3>
                  <p className="text-sm text-neutral-500">{status(item)}</p>
                </div>
                <button className="text-sm text-neutral-500 hover:text-black" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
              <Textarea
                rows={3}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  setVia("text");
                }}
                placeholder="What should change? For example: “Shorter, and mention our terrace.”"
                className="bg-white"
              />
              <div className="flex flex-wrap items-start gap-2">
                <Button
                  disabled={!!busy || comment.trim().length < 2}
                  onClick={async () => {
                    const next = await act({ action: "comment", item: item.id, text: comment, via }, "Rewriting this block…");
                    if (next) setComment("");
                  }}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null} {busy ? busy : "Rewrite"}
                </Button>
                <VoiceButton
                  send={transcribe}
                  disabled={!!busy}
                  onText={(value) => {
                    setComment((c) => (c ? `${c}\n${value}` : value));
                    setVia("voice");
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {item.status === "approved" ? (
                  <Button variant="secondary" disabled={!!busy} onClick={() => act({ action: "approve", items: [item.id], approved: false })}>
                    Reopen
                  </Button>
                ) : (
                  <Button variant="secondary" disabled={!!busy} onClick={() => act({ action: "approve", items: [item.id], approved: true })}>
                    <Check /> Approve this block
                  </Button>
                )}
                {item.history.some((e) => e.kind === "revision" && e.before) && (
                  <Button variant="ghost" disabled={!!busy} onClick={() => act({ action: "undo", item: item.id })}>
                    <RotateCcw /> Undo last rewrite
                  </Button>
                )}
              </div>
              {item.history.some((e) => e.kind === "comment") && (
                <ul className="grid gap-1.5 text-sm text-neutral-600">
                  {item.history
                    .filter((e) => e.kind === "comment")
                    .slice(-5)
                    .map((e) => (
                      <li key={e.at} className="rounded-lg bg-[#f3f2ee] px-3 py-2">
                        “{e.text}”
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : (
            <div className={surface}>
              <h3 className="font-semibold">Click any block to comment</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Write or say what to change — only that block is rewritten. Approve the blocks you like.
              </p>
            </div>
          )}
          {placeholders.length > 0 && (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">To fill in on this page:</p>
              <p className="mt-1">{placeholders.join(", ")}</p>
              <p className="mt-1 text-amber-800">Tell us the facts in a comment on the block, e.g. “the price is €12”.</p>
            </div>
          )}
          <div className={cn(surface, "grid gap-2")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Blocks on this page</h3>
              {items.some((i) => i.status !== "approved") && (
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act({ action: "approve", items: items.filter((i) => i.status !== "approved").map((i) => i.id), approved: true })}>
                  Approve all
                </Button>
              )}
            </div>
            <ul className="grid gap-1">
              {items.map((i) => (
                <li key={i.id}>
                  <button
                    className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm", selected === i.id ? "bg-[#f3f2ee]" : "hover:bg-neutral-50")}
                    onClick={() => setSelected(i.id)}
                  >
                    <span className="truncate">{i.label.split(" · ").slice(1).join(" · ") || i.label}</span>
                    <span className={cn("shrink-0 text-xs", i.status === "approved" ? "text-emerald-700" : "text-neutral-500")}>
                      {i.status === "approved" ? "Approved" : i.version > 1 ? `v${i.version}` : "To check"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---- Team ----
function TeamPanel({ view, act }: { view: View; act: Act }) {
  const [link, setLink] = useState("");
  return (
    <div className={cn(surface, "grid gap-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">For the team</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              // Select this onboarding's website in the admin first (cookie + ?site=), then open its pages (like the site switcher).
              setCurrentSite(view.siteId);
              // A full reload, like the site switcher: every screen starts from the new website.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/dashboard/pages");
            }}
          >
            Open in the page editor
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              const next = await act({ action: "new-link" });
              if (next?.token) setLink(`${window.location.origin}/onboarding/${view.id}#t=${encodeURIComponent(next.token)}`);
            }}
          >
            New client link
          </Button>
        </div>
      </div>
      {link && (
        <div className="rounded-xl bg-[#f3f2ee] p-3 text-sm">
          <p className="font-medium">Send this private link to the client (shown once; older links stop working):</p>
          <p className="mt-1 break-all font-mono text-[13px]">{link}</p>
        </div>
      )}
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-neutral-500">Website</dt>
          <dd className="font-medium">/site/{view.siteKey}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Style</dt>
          <dd className="font-medium">{view.plan ? `${view.plan.preset} · ${view.plan.fonts}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">AI calls</dt>
          <dd className="font-medium">{view.ai.calls}{view.mock ? " (simulated)" : ""}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">AI cost</dt>
          <dd className="font-medium">${view.ai.cost.toFixed(4)}</dd>
        </div>
      </dl>
      {view.ai.log.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">AI log</summary>
          <ul className="mt-2 grid gap-1 text-neutral-600">
            {view.ai.log.slice(-40).map((e) => (
              <li key={e.at + e.purpose}>
                {new Date(e.at).toLocaleTimeString("en-GB")} · {e.purpose} · {e.model} · {e.tokensIn}/{e.tokensOut} tokens · ${e.cost.toFixed(5)}
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">History</summary>
        <ul className="mt-2 grid gap-1 text-neutral-600">
          {view.events.slice(-40).reverse().map((e) => (
            <li key={e.at + e.text}>
              {new Date(e.at).toLocaleString("en-GB")} · {e.text} · {e.by}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
