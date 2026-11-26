"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { X } from "lucide-react";

// Small centred dialog for short forms (add website, client login, reset password).
// Esc or a click outside closes it.
export function SmallDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-[0_20px_60px_rgb(0_0_0/0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-black"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
      document.body,
    )
  );
}
