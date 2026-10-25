/** A panel below the unchanged header; the same button opens and closes it. */
export function bindSiteNavigation(
  root: HTMLElement,
  viewport?: HTMLElement | null,
) {
  const button = root.querySelector<HTMLButtonElement>("[data-menu-open]");
  const dialog = root.querySelector<HTMLDialogElement>("[data-site-menu]");
  if (!button || !dialog) return () => {};
  const scrollTarget = viewport ?? document.body;
  let previousOverflow: string | undefined;
  const background = [...(root.closest(".cms-site")?.children ?? [])].filter(
    (element) => !element.contains(root),
  ) as HTMLElement[];
  const inertState = new Map<HTMLElement, boolean>();
  const restore = () => {
    const wasOpen = previousOverflow !== undefined;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Open navigation");
    if (previousOverflow !== undefined)
      scrollTarget.style.overflow = previousOverflow;
    previousOverflow = undefined;
    inertState.forEach((value, element) => {
      element.inert = value;
    });
    inertState.clear();
    if (wasOpen && button.isConnected) button.focus({ preventScroll: true });
  };
  const close = () => {
    dialog.close();
    restore();
  };
  const toggle = () => {
    if (dialog.open) {
      close();
      return;
    }
    previousOverflow = scrollTarget.style.overflow;
    scrollTarget.style.overflow = "hidden";
    background.forEach((element) => {
      inertState.set(element, element.inert);
      element.inert = true;
    });
    dialog.show();
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-label", "Close navigation");
    button.focus({ preventScroll: true });
  };
  const click = (event: MouseEvent) => {
    if ((event.target as Element).closest("a")) close();
  };
  const keydown = (event: KeyboardEvent) => {
    if (!dialog.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [
        button,
        ...dialog.querySelectorAll<HTMLElement>(
          'a[href], button, summary, [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length);
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      focusable[
        (index + (event.shiftKey ? -1 : 1) + focusable.length) %
          focusable.length
      ]?.focus();
    }
  };
  button.addEventListener("click", toggle);
  dialog.addEventListener("click", click);
  dialog.addEventListener("close", restore);
  window.addEventListener("keydown", keydown, true);
  return () => {
    close();
    button.removeEventListener("click", toggle);
    dialog.removeEventListener("click", click);
    dialog.removeEventListener("close", restore);
    window.removeEventListener("keydown", keydown, true);
  };
}
