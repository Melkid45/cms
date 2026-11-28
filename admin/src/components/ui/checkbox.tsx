"use client";
import { Checkbox as Primitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
export function Checkbox({
  checked,
  onCheckedChange,
  ...props
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  "aria-label": string;
}) {
  return (
    <Primitive.Root
      {...props}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Primitive.Indicator>
        <Check className="size-3" />
      </Primitive.Indicator>
    </Primitive.Root>
  );
}
