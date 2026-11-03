"use client";
import { useCallback, useEffect, useState } from "react";

export function usePreviewSelection(openEditor: (id: string) => void) {
  const [selection, setSelection] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (!selection) return;
    let frame = 0;
    let target: HTMLElement | undefined;
    // Wait for the modal to release focus and the selected editor to mount.
    const start = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        target = [
          ...document.querySelectorAll<HTMLElement>("[data-editor-section]"),
        ].find((element) => element.dataset.editorSection === selection.id);
        target?.scrollIntoView({ block: "start", behavior: "instant" });
        target?.focus({ preventScroll: true });
        if (target) target.dataset.previewSelected = "true";
      });
    });
    return () => {
      cancelAnimationFrame(start);
      cancelAnimationFrame(frame);
      if (target) delete target.dataset.previewSelected;
    };
  }, [selection]);
  return useCallback(
    (id: string) => {
      openEditor(id);
      setSelection({ id });
    },
    [openEditor],
  );
}
