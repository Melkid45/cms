"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { Maximize2, Package, X } from "lucide-react";
export function ProductGallery({
  images,
  name,
  mode = "single",
}: {
  images: string[];
  name: string;
  mode?: "single" | "grid" | "wide";
}) {
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  function open(index: number) {
    setZoom(index);
    dialog.current?.showModal();
  }
  return (
    <div className={`product-gallery product-gallery--${mode}`}>
      <div className="product-gallery__frames">
        {(mode === "grid" ? images : images.slice(selected, selected + 1)).map(
          (src, i) => (
            <button
              type="button"
              key={src}
              className="product-gallery__frame"
              aria-label={`Enlarge ${name} photo ${mode === "grid" ? i + 1 : selected + 1}`}
              onClick={() => open(mode === "grid" ? i : selected)}
            >
              <img
                src={src}
                alt={`${name} — view ${mode === "grid" ? i + 1 : selected + 1}`}
                loading={i ? "lazy" : "eager"}
              />
              <Maximize2
                size={20}
                className="product-gallery__expand"
                aria-hidden="true"
              />
            </button>
          ),
        )}
        {!images.length && (
          <div className="product-gallery__placeholder">
            <Package size={48} />
            <span className="text text--sm">Image coming soon</span>
          </div>
        )}
      </div>
      {images.length > 1 && mode !== "grid" && (
        <div
          className="product-gallery__thumbnails"
          role="group"
          aria-label="Product photos"
        >
          {images.map((src, i) => (
            <button
              type="button"
              key={src}
              aria-label={`Show ${name} photo ${i + 1}`}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
            >
              <img src={src} alt="" width={88} height={88} />
            </button>
          ))}
        </div>
      )}
      <dialog
        ref={dialog}
        className="product-gallery__lightbox"
        aria-label={`${name} enlarged photo`}
        onClick={(e) => {
          if (e.currentTarget === e.target) dialog.current?.close();
        }}
      >
        <button
          type="button"
          aria-label="Close enlarged photo"
          onClick={() => dialog.current?.close()}
        >
          <X size={24} />
        </button>
        {images[zoom] && (
          <img src={images[zoom]} alt={`${name} — view ${zoom + 1}`} />
        )}
      </dialog>
    </div>
  );
}
