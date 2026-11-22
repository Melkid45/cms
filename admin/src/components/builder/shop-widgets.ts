// Small client-side behaviours of shop/map templates (no backend): catalogue filters (pricing-v21), product
// gallery and option prices (pricing-v22), configurator (pricing-v23), segmented toggles (pricing-v24),
// photo carousels (gallery-v20), delivery calculator (contact-v20), OpenStreetMap embeds and copy buttons
// (contact-v20/v21). Everything reads the rendered text, so editors only change ordinary fields.
import { pcSceneSvg } from "./pc-scene";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const num = (text: string | null | undefined) => {
  const m = (text || "").replace(/[\s ]/g, "").replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : NaN;
};
// Writes n into a price text, keeping its currency sign and position ("1499 €", "€1,499").
const withNumber = (template: string, n: number) =>
  /\d/.test(template)
    ? template.replace(/\d[\d\s .,]*\d|\d/, String(Math.round(n)))
    : `${Math.round(n)} €`;

export function mountShopWidgets(el: HTMLElement, signal: AbortSignal) {
  const undo: (() => void)[] = [];
  // Text written into React-rendered nodes goes through the text node itself, and every first write is undone on
  // unmount, so React keeps its nodes and a re-mount (dev strict mode, editor preview) starts from the real content.
  const originals = new Map<Element, string>();
  const original = (el: Element) => originals.get(el) ?? el.textContent ?? "";
  const setText = (el: Element, text: string) => {
    if (!originals.has(el)) {
      originals.set(el, el.textContent || "");
      const node = el.firstChild;
      undo.push(() => {
        if (node?.nodeType === 3 && node.parentNode === el) node.nodeValue = originals.get(el) ?? "";
        else el.textContent = originals.get(el) ?? "";
      });
    }
    const node = el.firstChild;
    if (node?.nodeType === 3 && el.childNodes.length === 1) node.nodeValue = text;
    else el.textContent = text;
  };
  const on = <K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ) => target.addEventListener(type, fn as EventListener, { signal });
  // Swaps a picture to another one's file: the stored src (not the browser's pick from a srcset) and without
  // srcset/sizes, which belong to the first picture. The original is restored on unmount.
  const swapped = new Map<HTMLImageElement, [string | null, string | null, string | null]>();
  const swapImage = (target: HTMLImageElement, from: HTMLImageElement | string) => {
    const src = typeof from === "string" ? from : from.getAttribute("src");
    if (!src) return;
    if (!swapped.has(target)) swapped.set(target, [target.getAttribute("src"), target.getAttribute("srcset"), target.getAttribute("sizes")]);
    target.removeAttribute("srcset");
    target.removeAttribute("sizes");
    target.src = src;
  };
  undo.push(() =>
    swapped.forEach(([src, srcset, sizes], img) => {
      if (src) img.setAttribute("src", src);
      if (srcset) img.setAttribute("srcset", srcset);
      if (sizes) img.setAttribute("sizes", sizes);
    }),
  );

  // Promo tile without a picture (pricing-v20): the animated PC illustration.
  el.querySelectorAll<HTMLElement>(".pricing__shop-promo").forEach((tile) => {
    if (tile.querySelector(".pricing__shop-promo-image, .pc-scene")) return;
    tile.insertAdjacentHTML("afterbegin", pcSceneSvg());
    tile.classList.add("has-scene");
    const scene = tile.querySelector<SVGElement>(".pc-scene");
    // pause the loop while the tile is off screen
    const io = new IntersectionObserver(([e]) => tile.classList.toggle("is-paused", !e.isIntersecting));
    io.observe(tile);
    undo.push(() => { io.disconnect(); scene?.remove(); tile.classList.remove("has-scene", "is-paused"); });
  });

  // Catalogue: chip groups (OR inside a group, AND between groups), price ceiling, sort.
  el.querySelectorAll<HTMLElement>("[data-catalog]").forEach((root) => {
    const grid = root.querySelector<HTMLElement>("[data-catalog-grid]");
    if (!grid) return;
    const cards = [...grid.querySelectorAll<HTMLElement>("article")];
    const info = cards.map((card, i) => ({
      card,
      i,
      price: num(card.querySelector(".pricing__shop-price .heading")?.textContent),
      // discount share from the old price (0 without one), for the "biggest discount" order
      off: ((p: number, old: number) => (old > p ? (old - p) / old : 0))(
        num(card.querySelector(".pricing__shop-price .heading")?.textContent),
        num(card.querySelector(".pricing__shop-old")?.textContent),
      ),
      tags: (card.querySelector(".pricing__shop-tags")?.textContent || "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    }));
    const groups = [
      ...root.querySelectorAll<HTMLElement>("[data-catalog-group]"),
    ];
    const range = root.querySelector<HTMLInputElement>("[data-catalog-price]");
    const sort = root.querySelector<HTMLSelectElement>("[data-catalog-sort]");
    // sort options left without a label are not offered
    sort?.querySelectorAll("option").forEach((o) => {
      if (o.textContent?.trim()) return;
      o.hidden = o.disabled = true;
      undo.push(() => (o.hidden = o.disabled = false));
    });
    const empty = root.querySelector<HTMLElement>("[data-catalog-empty]");
    const prices = info.map((x) => x.price).filter((p) => !Number.isNaN(p));
    const lo = prices.length ? Math.round(Math.min(...prices) / 100) * 100 : 0;
    const hi = prices.length ? Math.ceil(Math.max(...prices) / 100) * 100 : 0;
    const sign = cards[0]?.querySelector(".pricing__shop-price .heading")?.textContent || "0 €";
    if (range) {
      range.min = String(lo);
      range.max = String(hi);
      range.step = "50";
      range.value = String(hi);
    }
    const minLabel = root.querySelector("[data-catalog-min]"),
      maxLabel = root.querySelector("[data-catalog-max]");
    if (minLabel) setText(minLabel, withNumber(sign, lo));
    const apply = () => {
      const ceiling = range ? Number(range.value) : Infinity;
      if (maxLabel) setText(maxLabel, withNumber(sign, ceiling));
      const wanted = groups.map((g) =>
        [...g.querySelectorAll<HTMLElement>(".pricing__chip.is-active:not([data-catalog-all])")].map(
          (c) => (c.textContent || "").trim().toLowerCase(),
        ),
      );
      let shown = 0;
      for (const x of info) {
        const ok =
          !(x.price > ceiling) &&
          wanted.every((w) => !w.length || w.some((t) => x.tags.includes(t)));
        x.card.hidden = !ok;
        if (ok) shown++;
      }
      if (empty) empty.hidden = shown > 0;
      const mode = sort?.value || "default";
      const order = [...info].sort((a, b) =>
        mode === "price-asc"
          ? a.price - b.price || a.i - b.i
          : mode === "price-desc"
            ? b.price - a.price || a.i - b.i
            : mode === "discount"
              ? b.off - a.off || a.price - b.price
              : a.i - b.i,
      );
      order.forEach((x, n) => (x.card.style.order = String(n)));
    };
    groups.forEach((g) => {
      const all = g.querySelector<HTMLElement>("[data-catalog-all]");
      on(g, "click", (e) => {
        const chip = (e.target as Element).closest<HTMLElement>(".pricing__chip");
        if (!chip) return;
        if (chip === all) {
          g.querySelectorAll(".pricing__chip").forEach((c) => c.classList.toggle("is-active", c === all));
        } else {
          chip.classList.toggle("is-active");
          const any = g.querySelector(".pricing__chip.is-active:not([data-catalog-all])");
          all?.classList.toggle("is-active", !any);
        }
        apply();
      });
    });
    if (range) on(range, "input", apply);
    if (sort) on(sort, "change", apply);
    const toggle = root.querySelector<HTMLElement>("[data-catalog-toggle]");
    if (toggle)
      on(toggle, "click", () => {
        const open = !!toggle.parentElement?.classList.toggle("is-filters-open");
        toggle.setAttribute("aria-expanded", String(open));
      });
    const reset = root.querySelector("[data-catalog-reset]");
    if (reset)
      on(reset, "click", () => {
        groups.forEach((g) =>
          g.querySelectorAll(".pricing__chip").forEach((c) =>
            c.classList.toggle("is-active", c.hasAttribute("data-catalog-all")),
          ),
        );
        if (range) range.value = range.max;
        if (sort) sort.selectedIndex = 0;
        apply();
      });
    apply();
  });

  // Product: thumbnails swap the main photo; option choices add their "+N" to the price.
  el.querySelectorAll<HTMLElement>("[data-product]").forEach((root) => {
    const main = root.querySelector<HTMLImageElement>(".pricing__pd-image");
    const thumbs = [...root.querySelectorAll<HTMLButtonElement>(".pricing__pd-thumb")];
    thumbs[0]?.classList.add("is-active");
    thumbs.forEach((t) =>
      on(t, "click", () => {
        const img = t.querySelector("img");
        if (!img || !main) return;
        swapImage(main, img);
        main.alt = img.alt;
        thumbs.forEach((o) => o.classList.toggle("is-active", o === t));
      }),
    );
    const price = root.querySelector<HTMLElement>("[data-product-price]");
    const base = price ? original(price) : "";
    const recalc = () => {
      if (!price) return;
      let total = num(base);
      if (Number.isNaN(total)) return;
      root.querySelectorAll(".pricing__pd-choice.is-active .pricing__pd-delta").forEach((d) => {
        const n = num(d.textContent);
        if (!Number.isNaN(n)) total += n;
      });
      // a choice made in an option picker pop-up (pricing-v25)
      root.querySelectorAll<HTMLElement>(".pricing__pd-pick[data-pick-delta]").forEach((p) => {
        const n = num(p.dataset.pickDelta);
        if (!Number.isNaN(n)) total += n;
      });
      setText(price, withNumber(base, total));
    };
    on(root, "cms:pick" as keyof HTMLElementEventMap, recalc);
    root.querySelectorAll<HTMLElement>("[data-choice-group]").forEach((g) =>
      on(g, "click", (e) => {
        const choice = (e.target as Element).closest(".pricing__pd-choice");
        if (!choice) return;
        g.querySelectorAll(".pricing__pd-choice").forEach((c) => c.classList.toggle("is-active", c === choice));
        recalc();
      }),
    );
  });

  // Info pop-up (contact-v29, data-modal="x" with panels): links to "#x-2" open it on the second panel; "#x" on the first.
  el.querySelectorAll<HTMLElement>("[data-info-panels]").forEach((modal) => {
    const id = modal.dataset.modal;
    const panels = [...modal.querySelectorAll<HTMLElement>(".contact__info-panel")];
    if (!id || !panels.length) return;
    const show = (i: number) => panels.forEach((p, j) => p.classList.toggle("is-current", j === i));
    show(0);
    let opening: HTMLAnchorElement | null = null; // our own "#x" link: keeps the chosen panel
    document.addEventListener(
      "click",
      (e) => {
        const link = (e.target as Element).closest?.<HTMLAnchorElement>("a[href]");
        const m = link?.getAttribute("href")?.match(new RegExp(`^#${id}(?:-(\\d+))?$`));
        if (!m || link === opening) return;
        show(Math.min(panels.length, Math.max(1, Number(m[1] || 1))) - 1);
        if (m[1]) {
          // open through the pop-up's own link handling (site-widgets.ts), which knows "#x"
          e.preventDefault();
          e.stopPropagation();
          const opener = document.createElement("a");
          opener.href = `#${id}`;
          opener.hidden = true;
          el.append(opener);
          opening = opener;
          opener.click();
          opening = null;
          opener.remove();
        }
      },
      { signal, capture: true },
    );
    undo.push(() => panels.forEach((p) => p.classList.remove("is-current")));
  });

  // Option picker pop-up (pricing-v25, data-modal="x"): a card writes its picture, name and price change into the
  // product's pick row linked to "#x", the product price adds the change, a short notice shows and the pop-up closes.
  el.querySelectorAll<HTMLElement>("[data-option-picker]").forEach((picker) => {
    const cards = [...picker.querySelectorAll<HTMLButtonElement>(".pricing__picker-choice")];
    const nameOf = (card: Element) => card.querySelector(".pricing__picker-name")?.textContent?.trim() || "";
    const pick = [...el.querySelectorAll<HTMLAnchorElement>(".pricing__pd-pick")].find(
      (a) => a.getAttribute("href") === `#${picker.dataset.modal}`,
    );
    const product = pick?.closest<HTMLElement>("[data-product]");
    const img = pick?.querySelector<HTMLImageElement>("img");
    const [nameEl, deltaEl] = [...(pick?.querySelectorAll(".pricing__pd-pick-copy > *") || [])];
    const first = { name: nameEl ? original(nameEl) : "" };
    const done = picker.querySelector<HTMLElement>(".pricing__picker-done");
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    // the current choice: the card named like the pick row (the standard option), else the first card
    const mark = (card?: Element) => cards.forEach((c) => c.classList.toggle("is-active", c === card));
    mark(cards.find((c) => nameOf(c) === first.name) || cards[0]);
    cards.forEach((card) => {
      const v = card.querySelector<HTMLVideoElement>(".pricing__picker-video");
      if (v?.getAttribute("src") && !reducedMotion() && matchMedia("(hover: hover)").matches) {
        on(card, "mouseenter", () => { v.hidden = false; v.play().catch(() => {}); });
        on(card, "mouseleave", () => { v.pause(); v.hidden = true; });
        undo.push(() => { v.pause(); v.hidden = true; });
      }
      on(card, "click", () => {
        mark(card);
        if (pick) {
          const delta = card.querySelector(".pricing__picker-delta")?.textContent?.trim() || "";
          const n = num(delta);
          const photo = card.querySelector("img")?.getAttribute("src");
          if (img && photo) swapImage(img, photo);
          if (nameEl) setText(nameEl, nameOf(card));
          if (deltaEl) setText(deltaEl, Number.isNaN(n) || !n ? original(deltaEl) : delta);
          if (nameOf(card) === first.name) {
            delete pick.dataset.picked;
            delete pick.dataset.pickDelta;
          } else {
            pick.dataset.picked = nameOf(card);
            pick.dataset.pickDelta = Number.isNaN(n) ? "0" : String(n);
          }
          product?.dispatchEvent(new Event("cms:pick"));
        }
        picker.querySelector<HTMLElement>("[data-modal-close]")?.click();
        if (done?.textContent?.trim()) {
          done.hidden = false;
          clearTimeout(doneTimer);
          doneTimer = setTimeout(() => (done.hidden = true), 2500);
        }
      });
    });
    undo.push(() => {
      clearTimeout(doneTimer);
      if (done) done.hidden = true;
      if (pick) { delete pick.dataset.picked; delete pick.dataset.pickDelta; }
    });
  });

  // Configurator: an option sets its step value/price (and the picture if it has one); total = steps + base.
  el.querySelectorAll<HTMLElement>("[data-configurator]").forEach((root) => {
    const total = root.querySelector<HTMLElement>("[data-cfg-total]");
    const visual = root.querySelector<HTMLImageElement>(".pricing__cfg-image");
    const steps = [...root.querySelectorAll<HTMLDetailsElement>(".pricing__cfg-step")];
    if (steps.length && !steps.some((s) => s.open)) steps[0].open = true;
    // Options with a looping clip (muted video) play it in the big picture; reduced motion keeps the photo.
    const clip = root.querySelector<HTMLVideoElement>(".pricing__cfg-video");
    const showClip = (o: Element | null) => {
      if (!clip || !visual) return;
      const src = o?.querySelector<HTMLVideoElement>(".pricing__cfg-option-video")?.getAttribute("src");
      if (!src || reducedMotion()) {
        clip.pause();
        clip.hidden = true;
        visual.hidden = false;
        return;
      }
      clip.poster = visual.src;
      if (clip.getAttribute("src") !== src) clip.src = src;
      clip.hidden = false;
      clip.play().then(() => (visual.hidden = true)).catch(() => {});
    };
    undo.push(() => { clip?.pause(); if (clip) clip.hidden = true; if (visual) visual.hidden = false; });
    const sum = () => {
      let s = num(root.querySelector(".pricing__cfg-base-price")?.textContent);
      if (Number.isNaN(s)) s = 0;
      steps.forEach((st) => {
        const n = num(st.querySelector(".pricing__cfg-price")?.textContent);
        if (!Number.isNaN(n)) s += n;
      });
      if (total) setText(total, withNumber(original(total), s));
    };
    steps.forEach((st) => {
      const value = st.querySelector(".pricing__cfg-value");
      st.querySelectorAll<HTMLElement>(".pricing__cfg-option").forEach((o) => {
        const name = o.querySelector(".pricing__cfg-option-name")?.textContent?.trim();
        if (name && name === value?.textContent?.trim()) o.classList.add("is-active");
      });
      on(st, "click", (e) => {
        const o = (e.target as Element).closest<HTMLElement>(".pricing__cfg-option");
        if (!o) return;
        st.querySelectorAll(".pricing__cfg-option").forEach((x) => x.classList.toggle("is-active", x === o));
        const val = st.querySelector(".pricing__cfg-value"),
          pr = st.querySelector(".pricing__cfg-price");
        if (val) setText(val, o.querySelector(".pricing__cfg-option-name")?.textContent || "");
        if (pr) setText(pr, o.querySelector(".pricing__cfg-option-price")?.textContent || "");
        const img = o.querySelector("img");
        if (img && visual) {
          // short fade between cases, like the prototype
          visual.parentElement?.classList.add("is-swapping");
          setTimeout(() => {
            swapImage(visual, img);
            showClip(o);
            visual.parentElement?.classList.remove("is-swapping");
          }, reducedMotion() ? 0 : 200);
        }
        sum();
      });
    });
    showClip(root.querySelector(".pricing__cfg-option.is-active:has(img)"));
    sum();
  });

  // Photo tiles with a clip (gallery-v20/v21): play on hover (mouse) or when fully in view (touch), like the prototype.
  el.querySelectorAll<HTMLElement>(".gallery__tile").forEach((tile) => {
    const v = tile.querySelector<HTMLVideoElement>(".gallery__tile-video[src]");
    if (!v || reducedMotion()) return;
    const play = () => { v.hidden = false; v.play().then(() => tile.classList.add("is-playing")).catch(() => {}); };
    const stop = () => { v.pause(); tile.classList.remove("is-playing"); };
    if (matchMedia("(hover: hover)").matches) {
      on(tile, "mouseenter", play);
      on(tile, "mouseleave", stop);
    } else {
      const io = new IntersectionObserver(([e]) => (e.intersectionRatio > 0.8 ? play() : stop()), { threshold: [0, 0.8, 1] });
      io.observe(tile);
      undo.push(() => io.disconnect());
    }
    undo.push(() => { stop(); v.hidden = true; });
  });

  // Figures strip (advantages-v21): numbers count up once when the strip scrolls into view (prototype: 1.6 s,
  // ease-out, 120 ms apart). Non-numeric figures ("2–4") stay as they are.
  el.querySelectorAll<HTMLElement>(".advantages--strip").forEach((strip) => {
    if (reducedMotion()) return;
    const figs = [...strip.querySelectorAll<HTMLElement>(".advantages__stat .heading")].filter((f) => /^\d+\D*$/.test((f.textContent || "").trim()));
    if (!figs.length) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      figs.forEach((f, i) => {
        const full = original(f).trim(), end = parseInt(full, 10), suffix = full.replace(/^\d+/, "");
        const t0 = performance.now() + i * 120;
        const step = (now: number) => {
          const k = Math.max(0, Math.min(1, (now - t0) / 1600));
          setText(f, String(Math.round(end * (1 - Math.pow(1 - k, 3)))) + suffix);
          if (k < 1 && !signal.aborted) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    });
    io.observe(strip);
    undo.push(() => io.disconnect());
  });

  // Segmented toggles (checkout preview).
  el.querySelectorAll<HTMLElement>("[data-segmented]").forEach((g) =>
    on(g, "click", (e) => {
      const b = (e.target as Element).closest("button");
      if (b) g.querySelectorAll("button").forEach((x) => x.classList.toggle("is-active", x === b));
    }),
  );

  // Photo carousels: arrows scroll by one page of tiles.
  el.querySelectorAll<HTMLElement>("[data-scroller]").forEach((track) => {
    const root = track.closest("section") || track.parentElement!;
    const prev = root.querySelector<HTMLButtonElement>("[data-scroller-prev]"),
      next = root.querySelector<HTMLButtonElement>("[data-scroller-next]");
    const state = () => {
      if (prev) prev.disabled = track.scrollLeft < 4;
      if (next) next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4;
    };
    if (prev) on(prev, "click", () => track.scrollBy({ left: -track.clientWidth, behavior: "smooth" }));
    if (next) on(next, "click", () => track.scrollBy({ left: track.clientWidth, behavior: "smooth" }));
    on(track, "scroll", state);
    state();
  });

  // Delivery calculator: zones keep their price until the order total reaches their "free from" figure.
  el.querySelectorAll<HTMLElement>("[data-dlv-calc]").forEach((root) => {
    const range = root.querySelector<HTMLInputElement>("[data-dlv-range]");
    const out = root.querySelector<HTMLElement>("[data-dlv-out]");
    const free = root.querySelector(".contact__calc-free")?.textContent?.trim() || "0 €";
    const zones = [...root.querySelectorAll<HTMLElement>(".contact__zone")].filter(
      (z) => z.querySelector(".contact__zone-name")?.textContent?.trim(),
    );
    const data = zones.map((z) => {
      const priceEl = z.querySelector<HTMLElement>(".contact__zone-price");
      return {
        z,
        priceEl,
        price: priceEl ? original(priceEl) : "",
        from: num(z.querySelector(".contact__zone-note")?.textContent),
      };
    });
    const lo = num(root.querySelector("[data-dlv-min]")?.textContent),
      hi = num(root.querySelector("[data-dlv-max]")?.textContent);
    if (range && !Number.isNaN(lo) && !Number.isNaN(hi) && hi > lo) {
      const v = Math.min(Math.max(Number(range.value), lo), hi);
      range.min = String(lo);
      range.max = String(hi);
      range.value = String(v);
    }
    let active = 0;
    const fmt = out?.textContent || "0 €";
    const update = () => {
      const amount = range ? Number(range.value) : 0;
      if (out) setText(out, withNumber(fmt, amount));
      data.forEach((d) => {
        const isFree = Number.isNaN(num(d.price)) || (!Number.isNaN(d.from) && amount >= d.from);
        if (d.priceEl) {
          setText(d.priceEl, isFree ? (Number.isNaN(num(d.price)) ? d.price : free) : d.price);
          d.priceEl.classList.toggle("is-free", isFree);
        }
        d.z.classList.toggle("is-active", d === data[active]);
      });
      const cur = data[active];
      if (!cur) return;
      const set = (sel: string, text: string) => {
        const n = root.querySelector(sel);
        if (n) setText(n, text);
      };
      set("[data-dlv-zone]", cur.z.querySelector(".contact__zone-name")?.textContent || "");
      set("[data-dlv-price]", cur.priceEl?.textContent || "");
      set("[data-dlv-term]", cur.z.querySelector(".contact__zone-term")?.textContent || "");
    };
    data.forEach((d, i) => on(d.z, "click", () => ((active = i), update())));
    if (range) on(range, "input", update);
    // City field: suggestions from the hidden places list ("name | zone number | km"); a choice selects that zone
    // and the result reads "place · zone" (like the prototype). Choosing a zone row clears the place.
    const city = root.querySelector<HTMLInputElement>("[data-dlv-city]");
    const sugg = root.querySelector<HTMLElement>("[data-dlv-sugg]");
    const none = root.querySelector(".contact__calc-none")?.textContent?.trim() || "";
    // lines come rendered with <br> between them
    const placesEl = root.querySelector("[data-dlv-places]");
    const places = [...(placesEl?.childNodes || [])]
      .map((n) => (n.nodeName === "BR" ? "\n" : n.textContent || ""))
      .join("")
      .split("\n")
      .map((line) => line.split("|").map((x) => x.trim()))
      .filter(([name, zone]) => name && Number(zone) >= 1 && Number(zone) <= data.length)
      .map(([name, zone, km]) => ({ name, zone: Number(zone) - 1, km: Number(km) }));
    const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    let place = "";
    const zoneLabel = root.querySelector("[data-dlv-zone]");
    const showPlace = () => {
      if (zoneLabel && place) setText(zoneLabel, `${place} · ${data[active]?.z.querySelector(".contact__zone-name")?.textContent || ""}`);
    };
    const pick = (p: { name: string; zone: number }) => {
      active = p.zone;
      place = p.name;
      if (city) city.value = p.name;
      if (sugg) sugg.hidden = true;
      update();
      showPlace();
    };
    if (city && sugg && places.length) {
      on(city, "input", () => {
        const q = fold(city.value.trim());
        sugg.replaceChildren();
        if (!q) return void (sugg.hidden = true);
        const found = places
          .filter((p) => fold(p.name).includes(q))
          .sort((a, b) => fold(a.name).indexOf(q) - fold(b.name).indexOf(q))
          .slice(0, 6);
        for (const p of found) {
          const b = document.createElement("button");
          b.type = "button";
          b.setAttribute("role", "option");
          const zone = data[p.zone]?.z.querySelector(".contact__zone-name")?.textContent || "";
          const small = document.createElement("small");
          small.textContent = `· ${zone}${Number.isFinite(p.km) && p.km > 0 ? ` · ${p.km} km` : ""}`;
          b.append(p.name, small);
          b.addEventListener("click", () => pick(p));
          sugg.append(b);
        }
        if (!found.length && none) {
          const b = document.createElement("button");
          b.type = "button";
          b.disabled = true;
          b.textContent = none;
          sugg.append(b);
        }
        sugg.hidden = false;
      });
      on(city, "keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        sugg.querySelector<HTMLButtonElement>("button:not([disabled])")?.click();
      });
      on(document as unknown as HTMLElement, "click", (e) => {
        if (!(e.target as Element).closest?.(".contact__calc-city")) sugg.hidden = true;
      });
      undo.push(() => {
        sugg.replaceChildren();
        sugg.hidden = true;
        city.value = "";
      });
    }
    data.forEach((d) => on(d.z, "click", () => { place = ""; if (city) city.value = ""; }));
    if (range) on(range, "input", showPlace);
    update();
  });

  // OpenStreetMap embeds from ordinary links (?mlat=..&mlon=..#map=zoom/lat/lon).
  el.querySelectorAll<HTMLAnchorElement>("a[data-osm][href]").forEach((a) => {
    const box = a.parentElement;
    if (!box || box.querySelector("iframe")) return;
    try {
      const u = new URL(a.href);
      if (!/(^|\.)openstreetmap\.org$/.test(u.hostname)) return;
      const hash = u.hash.match(/map=(\d+)\/(-?[\d.]+)\/(-?[\d.]+)/);
      const lat = Number(u.searchParams.get("mlat") || hash?.[2]);
      const lon = Number(u.searchParams.get("mlon") || hash?.[3]);
      const zoom = Number(hash?.[1] || 16);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const d = 360 / 2 ** zoom; // roughly one map width at this zoom
      const frame = document.createElement("iframe");
      frame.title = a.textContent?.trim() || "Map";
      frame.loading = "lazy";
      frame.referrerPolicy = "no-referrer";
      frame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d / 2},${lon + d},${lat + d / 2}&layer=mapnik&marker=${lat},${lon}`;
      box.prepend(frame);
      undo.push(() => frame.remove());
    } catch {}
  });

  // Copy buttons: copy the nearest heading (an address) to the clipboard.
  el.querySelectorAll<HTMLElement>("[data-copy]").forEach((b) =>
    on(b, "click", () => {
      const text = (b.closest(".contact__pickup-body, .contact__hub-overlay") || b.closest("section"))?.querySelector(".contact__strong, h3")?.textContent?.trim();
      if (text) navigator.clipboard?.writeText(text).catch(() => {});
    }),
  );
  return () => undo.forEach((f) => f());
}
