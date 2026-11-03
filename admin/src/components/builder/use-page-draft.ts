"use client";
import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { CmsPage, Project } from "@/lib/builder/types";
import { saveProject } from "@/lib/builder/client";
let dirtyEditor: (() => boolean) | null = null;
export function confirmEditorLeave() {
  return (
    !dirtyEditor?.() ||
    window.confirm("You have unsaved changes. Leave this page without saving?")
  );
}
export function pageFingerprint(page: CmsPage) {
  return JSON.stringify({
    title: page.title,
    slug: page.slug,
    locale: page.locale,
    seo: page.seo,
    sections: page.sections,
    clientAccess: page.clientAccess,
  });
}
export function usePageDraft(
  page: CmsPage,
  setPage: Dispatch<SetStateAction<CmsPage>>,
  project: Project | null,
  initial?: CmsPage,
  enabled = true,
) {
  const [baseline, setBaseline] = useState(() =>
    initial ? pageFingerprint(initial) : pageFingerprint(page),
  );
  const [phase, setPhase] = useState<"saved" | "saving" | "error">("saved"),
    [notice, setNotice] = useState("");
  const latest = useRef({ page, project });
  useLayoutEffect(() => {
    latest.current = { page, project };
  }, [page, project]);
  const pending = useRef<Promise<Project> | null>(null);
  const errorPause = useRef(false);
  const dirty = pageFingerprint(page) !== baseline;
  const persist = useCallback(
    async (publish = false, automatic = false) => {
      if (pending.current) {
        await pending.current;
        if (!publish) return latest.current.project!;
      }
      const { page: snapshot, project: current } = latest.current;
      if (!current) throw Error("Project is still loading.");
      if (!enabled) throw Error("This page is managed by your administrator.");
      setPhase("saving");
      setNotice("");
      errorPause.current = false;
      const operation = saveProject(
        {
          ...current,
          pages: current.pages.some((p) => p.id === snapshot.id)
            ? current.pages.map((p) => (p.id === snapshot.id ? snapshot : p))
            : [...current.pages, snapshot],
        },
        publish ? snapshot.id : undefined,
        { autosave: automatic },
      );
      pending.current = operation;
      try {
        const result = await operation;
        const stored = result.pages.find((p) => p.id === snapshot.id)!;
        const editing = latest.current.page;
        const next =
          pageFingerprint(editing) === pageFingerprint(snapshot)
            ? stored
            : {
                ...editing,
                status: stored.status,
                updatedAt: stored.updatedAt,
                published: stored.published,
                history: stored.history,
              };
        latest.current = { page: next, project: result };
        setPage(next);
        setBaseline(pageFingerprint(stored));
        setPhase("saved");
        setNotice(
          publish
            ? "Changes published."
            : automatic
              ? "Draft saved automatically."
              : "Draft saved. Your live website is unchanged.",
        );
        return result;
      } catch (e) {
        errorPause.current = true;
        setPhase("error");
        setNotice(
          e instanceof Error
            ? e.message
            : "Could not save. Your edits are still here.",
        );
        throw e;
      } finally {
        pending.current = null;
      }
    },
    [enabled, setPage],
  );
  useEffect(() => {
    if (
      !dirty ||
      phase === "saving" ||
      !enabled ||
      !initial ||
      page.slug !== initial.slug ||
      errorPause.current
    )
      return;
    const timer = setTimeout(() => {
      void persist(false, true).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [dirty, page, phase, enabled, initial, persist]);
  useEffect(() => {
    if (!dirty && phase !== "saving") return;
    const checker = () => true;
    dirtyEditor = checker;
    const before = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      const a = (event.target as Element).closest?.("a");
      if (
        !a ||
        a.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const destination = new URL(a.href, location.href);
      if (
        destination.href === location.href ||
        (destination.pathname === location.pathname &&
          destination.search === location.search &&
          destination.hash)
      )
        return;
      if (!confirmEditorLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => {
      if (dirtyEditor === checker) dirtyEditor = null;
      removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, phase]);
  return {
    dirty,
    busy: phase === "saving",
    phase,
    notice,
    setNotice,
    persist: (publish = false) => persist(publish, false),
    label:
      phase === "saving"
        ? "Saving draft…"
        : phase === "error"
          ? "Could not save · changes kept in this editor"
          : dirty
            ? initial
              ? page.slug !== initial.slug
                ? "URL changed · save draft to confirm"
                : "Unsaved changes · autosave pending"
              : "Save this new page to enable autosave"
            : initial
              ? "All changes saved"
              : "Save this new page to enable autosave",
  };
}
