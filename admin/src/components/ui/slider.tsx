"use client";
import { Slider as Primitive } from "@base-ui/react/slider";
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  appearance = "admin",
  ...props
}: {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  appearance?: "admin" | "site";
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <Primitive.Root
      {...props}
      value={value}
      onValueChange={onValueChange}
      min={min}
      max={max}
      step={step}
      className={
        appearance === "site" ? "store-range" : "flex w-full items-center py-3"
      }
    >
      <Primitive.Control
        className={
          appearance === "site"
            ? "store-range__control"
            : "relative flex h-5 w-full touch-none items-center select-none"
        }
      >
        <Primitive.Track
          className={
            appearance === "site"
              ? "store-range__track"
              : "h-1.5 w-full rounded-full bg-muted"
          }
        >
          <Primitive.Indicator
            className={
              appearance === "site"
                ? "store-range__indicator"
                : "rounded-full bg-primary"
            }
          />
          <Primitive.Thumb
            className={
              appearance === "site"
                ? "store-range__thumb"
                : "size-4 rounded-full border border-input bg-background shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            }
          />
        </Primitive.Track>
      </Primitive.Control>
    </Primitive.Root>
  );
}
