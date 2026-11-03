"use client";
import { useEffect, useRef } from "react";
import type { Project, Section } from "@/lib/builder/types";
export function SiteFrame({
  project,
  sections,
  layout = true,
  className = "",
  width = "100%",
  onSelectSection,
}: {
  project: Project;
  sections: Section[];
  layout?: boolean;
  className?: string;
  width?: string;
  onSelectSection?: (id: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const editing = !!onSelectSection;
  const latest = useRef({ project, sections, layout, editing });
  const send = () =>
    ref.current?.contentWindow?.postMessage(
      { type: "harbstone-preview", payload: latest.current },
      location.origin,
    );
  useEffect(() => {
    latest.current = { project, sections, layout, editing };
    send();
  }, [project, sections, layout, editing]);
  useEffect(() => {
    const select = (event: MessageEvent) => {
      if (
        event.source !== ref.current?.contentWindow ||
        event.origin !== location.origin ||
        event.data?.type !== "harbstone-select-section" ||
        typeof event.data.id !== "string" ||
        !sections.some(
          (section) => section.id === event.data.id && !section.hidden,
        )
      )
        return;
      onSelectSection?.(event.data.id);
    };
    window.addEventListener("message", select);
    return () => window.removeEventListener("message", select);
  }, [onSelectSection, sections]);
  useEffect(() => {
    const ready = (e: MessageEvent) => {
      if (
        e.source === ref.current?.contentWindow &&
        e.origin === location.origin &&
        e.data?.type === "harbstone-ready"
      )
        send();
    };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, []);
  return (
    <iframe
      ref={ref}
      src="/canvas"
      title="Website preview"
      onLoad={send}
      className={`h-full min-h-[500px] border-0 bg-white ${className}`}
      style={{ width, maxWidth: "none" }}
    />
  );
}
