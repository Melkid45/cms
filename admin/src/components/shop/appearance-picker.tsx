"use client";
import Link from "next/link";
import "./appearance-picker.scss";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const names: Record<string, string> = {
  minimal: "Minimal",
  framed: "Framed",
  soft: "Soft background",
  overlay: "Over the image",
  compact: "Compact",
  split: "Classic split",
  gallery: "Photo gallery",
  spotlight: "Full-width image",
  panel: "Purchase panel",
  editorial: "Editorial",
};
const descriptions: Record<string, string> = {
  minimal: "An image and clean product information.",
  framed: "A complete card with a light border.",
  soft: "A soft surface around the whole card.",
  overlay: "Product details inside the photograph.",
  compact: "A thumbnail alongside essential details.",
  split: "Photography on the left, details on the right.",
  gallery: "Multiple images in a gallery beside product information.",
  spotlight: "A wide image with details arranged below.",
  panel: "A large image beside a soft purchase panel.",
  editorial: "Product story on the left, photography on the right.",
};
export function AppearancePicker<T extends string>({
  kind,
  title,
  value,
  options,
  onChange,
  preview,
}: {
  kind: "page" | "card";
  title: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  preview: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          role="radiogroup"
          aria-label={title}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        >
          {options.map((option) => (
            <label
              key={option}
              className={`relative cursor-pointer rounded-xl border p-3 transition hover:border-neutral-500 ${value === option ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"}`}
            >
              <input
                type="radio"
                name={`product-${kind}-appearance`}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="absolute right-3 top-3 accent-black"
                aria-label={names[option]}
              />
              <span
                aria-hidden="true"
                className="mb-4 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-neutral-100 p-3 pt-6"
              >
                <span
                  className={`appearance-preview appearance-preview--${kind} appearance-preview--${option}`}
                >
                  <span className="appearance-preview__photo" />
                  <span className="appearance-preview__copy">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </span>
              <span className="block text-sm font-medium">{names[option]}</span>
              <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                {descriptions[option]}
              </span>
            </label>
          ))}
        </div>
        <Link href={preview} target="_blank" className="text-sm underline">
          Preview selected {kind === "page" ? "product page" : "product cards"}
        </Link>
      </CardContent>
    </Card>
  );
}
