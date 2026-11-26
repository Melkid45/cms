"use client";
import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Select, SelectOption } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

// The HTML block remains the source of options and values. Shared shadcn controls
// enhance it without changing the catalog/checkout contracts or editor fields.
function StoreControl({
  input,
  canvas,
}: {
  input: HTMLSelectElement | HTMLInputElement;
  canvas: HTMLElement;
}) {
  const [value, setValue] = useState(input.value);
  useEffect(() => {
    const sync = () => setValue(input.value);
    input.addEventListener("change", sync);
    input.addEventListener("input", sync);
    return () => {
      input.removeEventListener("change", sync);
      input.removeEventListener("input", sync);
    };
  }, [input]);
  const change = (next: string) => {
    // Imperative bridge to the existing HTML block; input is a DOM node, not React data.
    // eslint-disable-next-line react-hooks/immutability
    input.value = next;
    setValue(next);
    input.dispatchEvent(
      new Event(input instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  };
  const owner = input.closest("label");
  const label =
    input.getAttribute("aria-label") ||
    [...(owner?.childNodes || [])]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join(" ")
      .trim() ||
    owner?.querySelector(":scope > span")?.textContent?.trim() ||
    "Select";
  return input instanceof HTMLSelectElement ? (
    <Select
      appearance="site"
      portalContainer={canvas}
      value={value}
      onValueChange={change}
      disabled={input.disabled}
      aria-label={label}
    >
      {[...input.options]
        .filter((o) => !o.hidden)
        .map((o) => (
          <SelectOption key={o.value} value={o.value} disabled={o.disabled}>
            {o.textContent}
          </SelectOption>
        ))}
    </Select>
  ) : (
    <Slider
      appearance="site"
      aria-label={label}
      min={Number(input.min)}
      max={Number(input.max)}
      step={Number(input.step) || 1}
      value={Number(value)}
      onValueChange={(v) => change(String(v))}
    />
  );
}
export function mountStoreControls(canvas: HTMLElement) {
  const controls = new Map<
    Element,
    { host: HTMLSpanElement; root: Root; hidden: boolean }
  >();
  const scan = () => {
    canvas
      .querySelectorAll<HTMLSelectElement | HTMLInputElement>(
        ".pricing--catalog select,.pricing--catalog input[type=range],.pricing--checkout select",
      )
      .forEach((input) => {
        if (input.closest(".store-control")) return;
        const existing = controls.get(input);
        if (existing) {
          if (existing.host.hidden !== input.hidden)
            existing.host.hidden = input.hidden;
          return;
        }
        const host = document.createElement("span");
        host.className = "store-control";
        input.before(host);
        const hidden = input.hidden;
        host.hidden = hidden;
        input.setAttribute("data-store-native", "");
        const root = createRoot(host);
        controls.set(input, { host, root, hidden });
        root.render(<StoreControl input={input} canvas={canvas} />);
      });
    for (const [input, control] of controls)
      if (!canvas.contains(input)) {
        control.root.unmount();
        control.host.remove();
        controls.delete(input);
      }
  };
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(canvas, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  return () => {
    observer.disconnect();
    for (const [input, control] of controls) {
      input.removeAttribute("data-store-native");
      queueMicrotask(() => {
        control.root.unmount();
        control.host.remove();
      });
    }
    controls.clear();
  };
}
