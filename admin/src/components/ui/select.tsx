"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "cn";

type SelectOptionProps = { value: string; children: React.ReactNode; disabled?: boolean };

// Declarative options keep form usage compact; the Select renders the actual items.
export function SelectOption(props: SelectOptionProps) {
  return <SelectPrimitive.Item {...props} />;
}

type SelectProps = Pick<React.ComponentProps<typeof SelectPrimitive.Root<string>>, "value" | "defaultValue" | "name" | "form" | "required" | "disabled"> & {
  id?: string;
  children: React.ReactNode;
  className?: string;
  placeholder?: string;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function Select({ children, id, className, placeholder = "Select an option", onValueChange, ...props }: SelectProps) {
  const options = React.Children.toArray(children).filter((child): child is React.ReactElement<SelectOptionProps> => React.isValidElement<SelectOptionProps>(child) && child.type === SelectOption);
  const items = options.map(({ props: option }) => ({ value: option.value, label: option.children }));
  const { "aria-label": label, "aria-describedby": description, "aria-invalid": invalid, ...rootProps } = props;

  return <SelectPrimitive.Root {...rootProps} items={items} onValueChange={(value) => { if (value !== null) onValueChange?.(value); }}>
    <SelectPrimitive.Trigger id={id} aria-label={label} aria-describedby={description} aria-invalid={invalid} data-slot="select-trigger" className={cn("flex h-8 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-popup-open:border-ring", className)}>
      <SelectPrimitive.Value placeholder={placeholder} className="min-w-0 truncate text-left data-placeholder:text-muted-foreground" />
      <SelectPrimitive.Icon className="shrink-0 text-muted-foreground"><ChevronDown className="size-3.5 transition-transform in-data-popup-open:rotate-180" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className="z-[100] outline-none">
        <SelectPrimitive.Popup className="w-[var(--anchor-width)] min-w-40 max-w-[var(--available-width)] overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
          <SelectPrimitive.List className="max-h-[min(280px,var(--available-height))] overflow-y-auto scroll-py-1">
            {options.map(({ props: option }) => <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled} className="relative flex min-h-8 cursor-default items-center rounded-md py-1.5 pr-8 pl-2.5 text-sm outline-none select-none data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-40">
              <SelectPrimitive.ItemText className="min-w-0 break-words">{option.children}</SelectPrimitive.ItemText>
              <SelectPrimitive.ItemIndicator className="absolute right-2"><Check className="size-3.5" /></SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>)}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
