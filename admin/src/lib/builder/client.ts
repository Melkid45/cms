"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { Project } from "./types";
let value: { project: Project | null; error: string } = {
  project: null,
  error: "",
};
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
function emit(project: Project | null, error = "") {
  value = { project, error };
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const serverValue = { project: null, error: "" };
export async function refreshProject() {
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch("/api/builder", { cache: "no-store" }),
        data = await response.json();
      if (!response.ok) throw Error(data.error);
      emit(data);
    } catch (e) {
      emit(
        value.project,
        e instanceof Error ? e.message : "Could not load project",
      );
    }
  })().finally(() => {
    pending = null;
  });
  return pending;
}
export async function saveProject(project: Project, publishId?: string) {
  const response = await fetch(
      "/api/builder" +
        (publishId ? `?publish=${encodeURIComponent(publishId)}` : ""),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      },
    ),
    data = await response.json();
  if (!response.ok) throw Error(data.error || "Could not save");
  emit(data);
  return data as Project;
}
export async function uploadMedia(file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/builder/media", {
      method: "POST",
      body: form,
    }),
    data = await response.json();
  if (!response.ok) throw Error(data.error || "Upload failed");
  emit(data.project);
  return data.asset as Project["media"][number];
}
export function useProject() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => value,
    () => serverValue,
  );
  useEffect(() => {
    if (!value.project) void refreshProject();
  }, []);
  return { ...snapshot, refresh: refreshProject, save: saveProject };
}
