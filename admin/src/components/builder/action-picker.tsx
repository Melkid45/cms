"use client";
import { createContext, useContext } from "react";
import type { ContentAction, CmsForm } from "@/lib/builder/types";
import { Select, SelectOption } from "@/components/ui/select";
export const BlockFormsContext = createContext<CmsForm[]>([]);
export function ActionPicker({
  value,
  onChange,
}: {
  value?: ContentAction;
  onChange: (value: ContentAction | undefined) => void;
}) {
  const forms = useContext(BlockFormsContext);
  return (
    <div className="space-y-2">
      <Select
        aria-label="Click action"
        value={value?.type === "service" ? "legacy" : value?.type || "link"}
        onValueChange={(type) =>
          onChange(
            type === "link"
              ? undefined
              : type === "none"
                ? { type: "none", target: "none" }
                : forms[0]
                  ? { type: "form", target: forms[0].id }
                  : undefined,
          )
        }
      >
        <SelectOption value="link">Open link</SelectOption>
        <SelectOption value="none">No action</SelectOption>
        <SelectOption value="form" disabled={!forms.length}>
          Open a form block
        </SelectOption>
        {value?.type === "service" && (
          <SelectOption value="legacy">Existing service link</SelectOption>
        )}
      </Select>
      {value?.type === "form" && (
        <Select
          aria-label="Form block"
          value={value.target}
          onValueChange={(target) => onChange({ type: "form", target })}
        >
          {forms.map((f) => (
            <SelectOption key={f.id} value={f.id}>
              {f.title}
            </SelectOption>
          ))}
        </Select>
      )}
    </div>
  );
}
