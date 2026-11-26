// Styled maps for map links in templates (contact-v20 pickup / zone card, contact-v21 hub): MapLibre GL with the
// free OpenFreeMap "Positron" style (no API key), loaded lazily from a pinned CDN build when the map scrolls into view.
// Opt-in through the ordinary map link (a[data-osm]) — an openstreetmap.org URL with extra query parameters:
//   style=positron          light outline street map with a round pin (instead of the plain OSM iframe)
//   pin=<image url>         image inside the round pin (e.g. the site's logo mark)
//   zones=<GeoJSON url>     delivery-zone map (features with properties.zone 0..2, optional outline/zoneLines,
//                           bounds), drawn over the section's map image: contact-v21 → the hub map (static, a click
//                           follows the first overlay button), contact-v20 → the map card (clickable: a zone click
//                           selects the matching .contact__zone row of the calculator)
// Without these parameters the link keeps the plain OSM iframe of shop-widgets.ts.
// Minimal shape of the global maplibregl object (the library is loaded from the CDN, not bundled).
type Ctor = new (o: unknown) => { setLngLat(l: unknown): { addTo(m: unknown): unknown }; setText(t: string): { addTo(m: unknown): unknown }; remove(): void };
type Lib = { Map: new (o: unknown) => unknown; NavigationControl: new (o: unknown) => unknown; Marker: Ctor; Popup: new (o: unknown) => { setLngLat(l: unknown): { setText(t: string): { addTo(m: unknown): unknown } }; remove(): void } };
type LngLat = [number, number];
type MapLike = {
  remove(): void;
  on(t: string, ...a: unknown[]): void;
  addControl(c: unknown, p?: string): void;
  getStyle(): { layers: { id: string; type: string }[] };
  addSource(id: string, s: unknown): void;
  addLayer(l: unknown, before?: string): void;
  setPaintProperty(l: string, p: string, v: unknown): void;
  setFilter(l: string, f: unknown): void;
  setFeatureState(f: unknown, s: unknown): void;
  getCanvas(): HTMLCanvasElement;
  jumpTo(o: unknown): void;
  fitBounds(b: unknown, o?: unknown): void;
  resize(): void;
};
const JS = "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js";
const CSS = "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css";
const STYLE = "https://tiles.openfreemap.org/styles/positron";
const ZONE_COLORS = ["#18a058", "#f29d1b", "#e2622b"];
let loading: Promise<Lib | null> | null = null;
function loadLib(): Promise<Lib | null> {
  const w = window as unknown as { maplibregl?: Lib };
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    if (!document.querySelector(`link[href="${CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS;
      document.head.append(link);
    }
    const s = document.createElement("script");
    s.src = JS;
    s.async = true;
    s.onload = () => resolve(w.maplibregl || null);
    s.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.append(s);
  });
  return loading;
}
type Opts = { lat: number; lon: number; zoom: number; style: string; pin: string; zones: string };
function parse(href: string): Opts | null {
  try {
    const u = new URL(href, location.href);
    if (!/(^|\.)openstreetmap\.org$/.test(u.hostname)) return null;
    const hash = u.hash.match(/map=([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)/);
    const lat = Number(u.searchParams.get("mlat") || hash?.[2]);
    const lon = Number(u.searchParams.get("mlon") || hash?.[3]);
    const o = {
      lat,
      lon,
      zoom: Number(hash?.[1] || 15),
      style: u.searchParams.get("style") || "",
      pin: u.searchParams.get("pin") || "",
      zones: u.searchParams.get("zones") || "",
    };
    if (!o.style && !o.zones) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return o;
  } catch {
    return null;
  }
}
function pin(src: string, size: number) {
  const d = document.createElement("div");
  d.className = "cms-map__pin";
  d.style.width = d.style.height = `${size}px`;
  if (src && /^(\/|https?:)/.test(src)) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    d.append(img);
  }
  return d;
}
// Zone colours follow the site: --zone-color of the section's legend items / zone rows, else the defaults.
function zoneColors(section: Element) {
  const items = [...section.querySelectorAll(".contact__legend-item, .contact__zone")];
  return ZONE_COLORS.map((c, i) => {
    const v = items[i] && getComputedStyle(items[i]).getPropertyValue("--zone-color").trim();
    return v || c;
  });
}
type Geo = {
  type: string;
  bounds?: [LngLat, LngLat];
  features: { id?: number; properties: { zone: number; name?: string } }[];
  outline?: LngLat[][];
  zoneLines?: Record<string, LngLat[][]>;
};
const geoCache = new Map<string, Promise<Geo | null>>();
const loadGeo = (url: string) => {
  if (!geoCache.has(url))
    geoCache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  return geoCache.get(url)!;
};

export function mountMapWidgets(el: HTMLElement, signal: AbortSignal) {
  const maps: MapLike[] = [];
  const undo: (() => void)[] = [];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lazy = (box: Element, run: () => void) => {
    if (!("IntersectionObserver" in window)) return run();
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          if (!signal.aborted) run();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(box);
    undo.push(() => io.disconnect());
  };
  const holder = (parent: Element, cls = "") => {
    const d = document.createElement("div");
    d.className = `cms-map ${cls}`.trim();
    parent.prepend(d);
    undo.push(() => d.remove());
    return d;
  };
  const baseOpts = (container: HTMLElement) => ({
    container,
    style: STYLE,
    attributionControl: { compact: true },
    scrollZoom: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    fadeDuration: reduce ? 0 : 300,
  });

  // Street map with a pin.
  function street(link: HTMLAnchorElement, o: Opts) {
    const box = link.parentElement;
    if (!box) return;
    // the plain iframe of shop-widgets (if it was added first) gives way to the styled map
    box.querySelectorAll("iframe").forEach((f) => f.remove());
    box.dataset.mapStyled = "true";
    undo.push(() => delete box.dataset.mapStyled);
    const container = holder(box);
    lazy(box, async () => {
      const lib = await loadLib();
      if (!lib || signal.aborted) return;
      const overlay = box.parentElement?.querySelector<HTMLElement>(".contact__hub-overlay");
      const map = new lib.Map({
        ...baseOpts(container),
        center: [o.lon, o.lat],
        zoom: o.zoom,
        cooperativeGestures: true,
      } as never) as unknown as MapLike;
      maps.push(map);
      map.addControl(new lib.NavigationControl({ showCompass: false }), "top-left");
      new lib.Marker({ element: pin(o.pin, 46) }).setLngLat([o.lon, o.lat]).addTo(map as never);
      // the pin sits in the middle of the part not covered by the overlay card (as in the prototype)
      const fit = () =>
        map.jumpTo({ center: [o.lon, o.lat], padding: { top: 0, left: 0, right: 0, bottom: overlay?.offsetHeight || 0 } });
      fit();
      map.on("resize", fit);
      box.dataset.mapReady = "true";
    });
  }

  // Zone map drawn over an image box (the image keeps the space, so nothing shifts).
  function zones(o: Opts, section: Element, kind: "hub" | "card") {
    const host =
      kind === "hub"
        ? section.querySelector<HTMLElement>(".contact__hub-map")
        : section.querySelector<HTMLElement>(".contact__dlv-map");
    if (!host) return;
    const img = host.querySelector<HTMLImageElement>(kind === "hub" ? ".contact__hub-image" : ".contact__dlv-map-image");
    const container = holder(host, kind === "hub" ? "cms-map--fill" : "cms-map--over");
    const place = () => {
      if (kind !== "card" || !img) return;
      container.style.top = `${img.offsetTop}px`;
      container.style.left = `${img.offsetLeft}px`;
      container.style.width = `${img.offsetWidth}px`;
      container.style.height = `${img.offsetHeight}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    if (img) ro.observe(img);
    undo.push(() => ro.disconnect());
    const colors = zoneColors(section);
    lazy(host, async () => {
      const [lib, geo] = await Promise.all([loadLib(), loadGeo(o.zones)]);
      if (!lib || !geo || signal.aborted) return;
      const overlay = host.querySelector<HTMLElement>(".contact__hub-overlay");
      const pad = () =>
        kind === "hub"
          ? { top: 18, left: 18, right: 18, bottom: (overlay?.offsetHeight || 0) + 8 }
          : 12;
      const bounds = geo.bounds || [[20.9, 55.62], [28.3, 58.12]];
      const interactive = kind === "card";
      const map = new lib.Map({
        ...baseOpts(container),
        bounds,
        fitBoundsOptions: { padding: pad() },
        interactive,
      } as never) as unknown as MapLike;
      maps.push(map);
      if (interactive) map.addControl(new lib.NavigationControl({ showCompass: false }), "top-left");
      const popup = new lib.Popup({ closeButton: false, closeOnClick: false, className: "cms-map__pop", offset: 8 });
      map.on("load", () => {
        const first = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
        const world: LngLat[] = [[-179, -85], [179, -85], [179, 85], [-179, 85], [-179, -85]];
        if (geo.outline?.length) {
          map.addSource("z-mask", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...geo.outline] } } });
          map.addLayer({ id: "z-mask", type: "fill", source: "z-mask", paint: { "fill-color": "#ffffff", "fill-opacity": 0.55 } }, first);
          map.addLayer({ id: "z-line", type: "line", source: "z-mask", paint: { "line-color": "#0e1116", "line-width": 1.2, "line-opacity": 0.45 } }, first);
        }
        map.addSource("z-reg", { type: "geojson", data: { type: "FeatureCollection", features: geo.features } });
        map.addLayer(
          {
            id: "z-fill",
            type: "fill",
            source: "z-reg",
            paint: {
              "fill-color": ["match", ["get", "zone"], 0, colors[0], 1, colors[1], colors[2]],
              "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.1, 0],
            },
          },
          first,
        );
        const lines = geo.zoneLines || {};
        map.addSource("z-zl", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [0, 1].map((z) => ({ type: "Feature", properties: { zone: z }, geometry: { type: "MultiLineString", coordinates: lines[z] || [] } })),
          },
        });
        map.addLayer(
          {
            id: "z-zl",
            type: "line",
            source: "z-zl",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": ["match", ["get", "zone"], 0, colors[0], colors[1]], "line-width": 3 },
          },
          first,
        );
        map.addLayer({ id: "z-sel", type: "line", source: "z-reg", filter: ["==", ["get", "zone"], -1], paint: { "line-color": "#0e1116", "line-width": 2.2 } }, first);
        new lib.Marker({ element: pin(o.pin, kind === "hub" ? 26 : 30) }).setLngLat([o.lon, o.lat]).addTo(map as never);
        if (img) img.style.visibility = "hidden";
        undo.push(() => img && (img.style.visibility = ""));
        host.dataset.mapReady = "true";
        if (kind === "hub") {
          const go = section.querySelector<HTMLAnchorElement>(".contact__hub-overlay .actions a[href]");
          if (go) {
            container.style.cursor = "pointer";
            container.addEventListener("click", () => go.click(), { signal });
          }
          return;
        }
        // clickable zones: pick the matching calculator row; the active row highlights its zone
        const rows = [...section.querySelectorAll<HTMLElement>(".contact__zone")];
        const show = (z: number) => {
          map.setPaintProperty("z-fill", "fill-opacity", ["case", ["==", ["get", "zone"], z], 0.22, ["boolean", ["feature-state", "hover"], false], 0.1, 0]);
          map.setFilter("z-sel", ["==", ["get", "zone"], z]);
        };
        let hov: number | string | undefined;
        map.on("mousemove", "z-fill", (e: { features: { id: number; properties: { name?: string } }[]; lngLat: unknown }) => {
          const f = e.features[0];
          map.getCanvas().style.cursor = "pointer";
          if (hov !== undefined && hov !== f.id) map.setFeatureState({ source: "z-reg", id: hov }, { hover: false });
          hov = f.id;
          map.setFeatureState({ source: "z-reg", id: hov }, { hover: true });
          if (f.properties.name) popup.setLngLat(e.lngLat as never).setText(f.properties.name).addTo(map as never);
        });
        map.on("mouseleave", "z-fill", () => {
          if (hov !== undefined) map.setFeatureState({ source: "z-reg", id: hov }, { hover: false });
          hov = undefined;
          popup.remove();
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "z-fill", (e: { features: { properties: { zone: number } }[] }) => {
          const z = Number(e.features[0].properties.zone);
          rows[z]?.click();
          show(z);
        });
        rows.forEach((r, i) => r.addEventListener("click", () => show(i), { signal }));
        const active = rows.findIndex((r) => r.classList.contains("is-active"));
        if (active >= 0) show(active);
      });
    });
  }

  el.querySelectorAll<HTMLAnchorElement>("a[data-osm][href]").forEach((link) => {
    const o = parse(link.getAttribute("href") || "");
    if (!o) return;
    const section = link.closest("section");
    if (!section) return;
    if (o.zones) {
      if (section.querySelector(".contact__hub-map") && link.closest(".contact__hub-map")) {
        const box = link.parentElement;
        box?.querySelectorAll("iframe").forEach((f) => f.remove());
        if (box) {
          box.dataset.mapZones = "true";
          undo.push(() => delete box.dataset.mapZones);
        }
        zones(o, section, "hub");
      }
      else if (section.querySelector(".contact__dlv-map")) {
        zones(o, section, "card");
        if (o.style) street(link, o);
      }
      return;
    }
    street(link, o);
  });

  return () => {
    maps.forEach((m) => {
      try {
        m.remove();
      } catch {}
    });
    undo.forEach((f) => f());
  };
}
