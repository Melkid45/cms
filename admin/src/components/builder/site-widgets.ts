// Client behaviours of library blocks (anselat agent, 2026-11-19). Shop/map behaviours: ./shop-widgets.ts.
// - [data-modal="x"] sections open as a pop-up from links to "#x" (calculator-v40);
// - [data-calc] price estimate (width in metres x price per metre; the server recomputes it);
// - [data-logos-marquee] endless logo row (logos-v40);
// - [data-share] share links for the current page (content-v41);
// - [data-current-links] marks the link of the current page (hero-v41 tabs);
// - [data-justified] photo pairs sized by their proportions (gallery-v40);
// - [data-back-to-top] smooth scroll to the top (footer-v40).
// Mounted by SiteCanvas; returns a cleanup that undoes every DOM change.
export function mountSiteWidgets(
  root: HTMLElement,
  signal: AbortSignal,
  editing = false,
): () => void {
  const undo: (() => void)[] = [];

  // ---------------------------------------------------------------- modals
  const modals = [...root.querySelectorAll<HTMLElement>("[data-modal]")];
  let lastFocus: HTMLElement | null = null;
  const close = (modal: HTMLElement) => {
    if (!modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    document.documentElement.removeAttribute("data-modal-open");
    if (location.hash === `#${modal.dataset.modal}`)
      history.replaceState(null, "", location.pathname + location.search);
    lastFocus?.focus();
  };
  const open = (modal: HTMLElement) => {
    if (editing) return;
    lastFocus = document.activeElement as HTMLElement | null;
    modals.forEach((m) => m !== modal && close(m));
    modal.classList.add("is-open");
    document.documentElement.setAttribute("data-modal-open", "");
    modal
      .querySelector<HTMLElement>(
        "input:not([type=radio]):not([type=hidden]),button",
      )
      ?.focus({ preventScroll: true });
  };
  if (modals.length) {
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as Element;
        const link = target.closest<HTMLAnchorElement>("a[href*='#']");
        if (link && !editing) {
          const url = new URL(link.href, location.href);
          const modal = modals.find((m) => `#${m.dataset.modal}` === url.hash);
          if (modal && url.pathname === location.pathname) {
            e.preventDefault();
            // A link inside the open mobile menu: close the menu first.
            if (document.documentElement.hasAttribute("data-site-menu-open"))
              document
                .querySelector<HTMLElement>("[data-menu-toggle][aria-expanded=true]")
                ?.click();
            open(modal);
            return;
          }
        }
        const closer = target.closest("[data-modal-close]");
        const modal = target.closest<HTMLElement>("[data-modal].is-open");
        if (modal && (closer || target === modal)) close(modal);
      },
      { signal },
    );
    document.addEventListener(
      "keydown",
      (e) => {
        const modal = modals.find((m) => m.classList.contains("is-open"));
        if (!modal) return;
        if (e.key === "Escape") close(modal);
        if (e.key === "Tab") {
          const items = [
            ...modal.querySelectorAll<HTMLElement>(
              "a[href],button:not([disabled]),input:not([disabled])",
            ),
          ].filter((el) => el.offsetParent !== null);
          const first = items[0],
            last = items.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      },
      { signal },
    );
    const fromHash = modals.find((m) => location.hash === `#${m.dataset.modal}`);
    if (fromHash) open(fromHash);
    undo.push(() => {
      modals.forEach((m) => m.classList.remove("is-open"));
      document.documentElement.removeAttribute("data-modal-open");
    });
  }

  // ---------------------------------------------------------------- calculator
  root.querySelectorAll<HTMLFormElement>("form[data-calc]").forEach((form) => {
    const scope = form.closest("section") || form;
    const rate =
      parseFloat(
        (scope.querySelector("[data-calc-rate]")?.textContent || "")
          .replace(/\s/g, "")
          .replace(",", "."),
      ) || 0;
    const currency =
      scope.querySelector("[data-calc-currency]")?.textContent?.trim() || "€";
    const width = form.querySelector<HTMLInputElement>("[data-calc-width]");
    const total = scope.querySelector<HTMLElement>("[data-calc-total]");
    const success = scope.querySelector<HTMLElement>("[data-calc-success]");
    const initial = total?.textContent || "";
    // A chosen radio is sent as its (editable, translatable) label, not its template value.
    form.addEventListener(
      "formdata",
      (e) => {
        form
          .querySelectorAll<HTMLInputElement>("input[type=radio]:checked")
          .forEach((radio) => {
            const label = radio.closest("label")?.textContent?.trim();
            if (label) e.formData.set(radio.name, label);
          });
      },
      { signal },
    );
    const update = () => {
      const mm = parseFloat(width?.value || "") || 0;
      const sum = Math.max(0, Math.round((mm / 1000) * rate));
      if (total)
        total.textContent = `${sum.toLocaleString("lv-LV")} ${currency}`;
    };
    form.addEventListener("input", update, { signal });
    form.addEventListener(
      "cms:sent",
      () => {
        if (!success) return;
        form.hidden = true;
        success.hidden = false;
        update();
      },
      { signal },
    );
    // Reopening after a sent request shows the empty form again.
    scope.querySelectorAll("[data-modal-close]").forEach((button) =>
      button.addEventListener(
        "click",
        () => {
          if (success && !success.hidden) {
            success.hidden = true;
            form.hidden = false;
            update();
          }
        },
        { signal },
      ),
    );
    update();
    undo.push(() => {
      if (total) total.textContent = initial;
      if (success) success.hidden = true;
      form.hidden = false;
    });
  });

  // ---------------------------------------------------------------- logo marquee
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root
    .querySelectorAll<HTMLElement>("[data-logos-marquee]")
    .forEach((viewport) => {
      const track = viewport.firstElementChild as HTMLElement | null;
      if (!track || reduced || track.children.length < 2) return;
      const clones = [...track.children].map((item) => {
        const copy = item.cloneNode(true) as HTMLElement;
        copy.setAttribute("aria-hidden", "true");
        copy.querySelectorAll("img").forEach((img) => (img.alt = ""));
        track.append(copy);
        return copy;
      });
      // About 60px per second regardless of how many logos there are.
      track.style.setProperty(
        "--logos-duration",
        `${Math.max(12, track.scrollWidth / 2 / 60)}s`,
      );
      viewport.classList.add("is-running");
      undo.push(() => {
        clones.forEach((c) => c.remove());
        viewport.classList.remove("is-running");
        track.style.removeProperty("--logos-duration");
      });
    });

  // ---------------------------------------------------------------- share
  root.querySelectorAll<HTMLElement>("[data-share]").forEach((box) => {
    const url = location.href.split("#")[0];
    const title = document.title;
    const links = new Map<HTMLAnchorElement, string>();
    box
      .querySelectorAll<HTMLAnchorElement>("a[data-share-network]")
      .forEach((a) => {
        links.set(a, a.getAttribute("href") || "");
        if (a.dataset.shareNetwork === "facebook")
          a.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        if (a.dataset.shareNetwork === "whatsapp")
          a.href = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;
      });
    const status = box.querySelector<HTMLElement>("[role=status]");
    const copied =
      box.querySelector("[data-share-copied]")?.textContent?.trim() ||
      "Link copied";
    box
      .querySelector<HTMLElement>("[data-share-network=copy]")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await navigator.clipboard.writeText(url);
            if (status) status.textContent = copied;
          } catch {
            if (status) status.textContent = url;
          }
        },
        { signal },
      );
    undo.push(() => {
      links.forEach((href, a) => a.setAttribute("href", href));
      if (status) status.textContent = "";
    });
  });

  // ---------------------------------------------------------------- current links
  root
    .querySelectorAll<HTMLElement>("[data-current-links]")
    .forEach((group) => {
      group.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
        const url = new URL(a.href, location.href);
        if (url.pathname === location.pathname && !url.hash) {
          a.classList.add("is-current");
          a.setAttribute("aria-current", "page");
          undo.push(() => {
            a.classList.remove("is-current");
            a.removeAttribute("aria-current");
          });
        }
      });
    });

  // ---------------------------------------------------------------- justified rows
  // Up to three photos share one row and one height, widths follow their proportions;
  // more photos are split into rows of three (four: two rows of two).
  root.querySelectorAll<HTMLElement>("[data-justified]").forEach((row) => {
    const items = [...row.children] as HTMLElement[];
    const ratio = (item: HTMLElement) => {
      const img = item.querySelector("img");
      return img?.naturalWidth ? img.naturalWidth / img.naturalHeight : 0;
    };
    const perRow = items.length <= 3 ? items.length : items.length === 4 ? 2 : 3;
    const layout = () => {
      for (let i = 0; i < items.length; i += perRow) {
        const group = items.slice(i, i + perRow);
        const ratios = group.map(ratio);
        if (ratios.some((r) => !r)) continue;
        if (group.length < 2) {
          group[0].style.aspectRatio = ratios[0].toFixed(4);
          continue;
        }
        const sum = ratios.reduce((a, b) => a + b, 0);
        group.forEach((item, n) => {
          item.style.flexBasis = `calc((100% - var(--justified-gap) * ${group.length - 1}) * ${(ratios[n] / sum).toFixed(4)})`;
          item.style.aspectRatio = ratios[n].toFixed(4);
        });
      }
    };
    row.querySelectorAll("img").forEach((img) => {
      img.loading = "eager";
      if (!img.complete) img.addEventListener("load", layout, { signal });
    });
    layout();
    undo.push(() =>
      items.forEach((item) => {
        item.style.removeProperty("flex-basis");
        item.style.removeProperty("aspect-ratio");
      }),
    );
  });

  // ---------------------------------------------------------------- back to top
  root.querySelectorAll<HTMLElement>("[data-back-to-top]").forEach((link) =>
    link.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      },
      { signal },
    ),
  );

  // ---------------------------------------------------------------- library agent (v50…v59)
  // [data-hero-video] background video (hero-v52): muted autoplay loop, poster image underneath;
  // with prefers-reduced-motion the video is not played (CSS hides it), the pause button toggles it.
  root.querySelectorAll<HTMLVideoElement>("video[data-hero-video]").forEach((video) => {
    const toggle = video
      .closest("section")
      ?.querySelector<HTMLButtonElement>("[data-hero-video-toggle]");
    video.muted = true;
    const label = (paused: boolean) => {
      toggle?.classList.toggle("is-paused", paused);
      toggle?.setAttribute(
        "aria-label",
        paused ? "Play the background video" : "Pause the background video",
      );
    };
    if (reduced || !video.getAttribute("src")) {
      video.pause();
      video.preload = "none";
      label(true);
    } else {
      // Starts after the page has loaded, so the video does not compete with the poster
      // (the LCP image); the markup has no autoplay and preload="none" (section-renderer).
      const start = () =>
        video.play().then(() => label(false)).catch(() => label(true));
      if (document.readyState === "complete") start();
      else window.addEventListener("load", start, { once: true, signal });
    }
    toggle?.addEventListener(
      "click",
      () => {
        if (video.paused) video.play().then(() => label(false)).catch(() => {});
        else {
          video.pause();
          label(true);
        }
      },
      { signal },
    );
    undo.push(() => toggle?.classList.remove("is-paused"));
  });

  // [data-compare] before/after divider (gallery-v50): the range input drives --pos.
  root.querySelectorAll<HTMLElement>("[data-compare]").forEach((stage) => {
    const range = stage.querySelector<HTMLInputElement>("input[type=range]");
    if (!range) return;
    const set = () => stage.style.setProperty("--pos", `${range.value}%`);
    range.addEventListener("input", set, { signal });
    set();
    undo.push(() => stage.style.removeProperty("--pos"));
  });

  // [data-menu-nav] category chips (pricing-v50), built from the visible category titles.
  root.querySelectorAll<HTMLElement>("[data-menu-nav]").forEach((nav) => {
    const section = nav.closest("section");
    if (!section || nav.childElementCount) return;
    const groups = [
      ...section.querySelectorAll<HTMLElement>(".pricing__menu-group"),
    ].filter((g) => g.querySelector(".pricing__menu-title .heading")?.textContent?.trim());
    if (groups.length < 2) return;
    const chips = groups.map((group, n) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "pricing__menu-chip";
      chip.textContent =
        group.querySelector(".pricing__menu-title .heading")?.textContent?.trim() || "";
      if (n === 0) chip.setAttribute("aria-current", "true");
      chip.addEventListener(
        "click",
        () => {
          chips.forEach((c) => c.removeAttribute("aria-current"));
          chip.setAttribute("aria-current", "true");
          group.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        },
        { signal },
      );
      nav.append(chip);
      return chip;
    });
    undo.push(() => chips.forEach((c) => c.remove()));
  });

  return () => undo.forEach((fn) => fn());
}
