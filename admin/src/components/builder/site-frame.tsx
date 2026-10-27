"use client";
import { useEffect, useRef } from "react";
import type { Project, Section } from "@/lib/builder/types";
export function SiteFrame({
  project,
  sections,
  layout = true,
  className = "",
  width = "100%",
}: {
  project: Project;
  sections: Section[];
  layout?: boolean;
  className?: string;
  width?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const latest = useRef({ project, sections, layout });
  const send = () =>
    ref.current?.contentWindow?.postMessage(
      { type: "harbstone-preview", payload: latest.current },
      location.origin,
    );
  useEffect(() => {
    latest.current = { project, sections, layout };
    send();
  }, [project, sections, layout]);
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
