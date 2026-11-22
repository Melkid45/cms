"use client";
import type { ContentAction } from "@/lib/builder/types";
import { useProject } from "@/lib/builder/client";
import { Select, SelectOption } from "@/components/ui/select";
export function ActionPicker({
  value,
  onChange,
}: {
  value?: ContentAction;
  onChange: (value: ContentAction | undefined) => void;
}) {
  const { project } = useProject();
  const forms = project?.formDefinitions || [];
  const services = project?.services || [];
  return (
    <div className="space-y-2">
      <Select
        aria-label="Link action"
        value={value?.type || "link"}
        onValueChange={(type) => {
          if (type === "link") onChange(undefined);
          else {
            const first = (type === "form" ? forms : services)[0];
            if (first)
              onChange({
                type: type as ContentAction["type"],
                target: first.id,
              });
          }
        }}
      >
        <SelectOption value="link">Open link</SelectOption>
        <SelectOption value="form" disabled={!forms.length}>
          Open form
        </SelectOption>
        <SelectOption value="service" disabled={!services.length}>
          Open service
        </SelectOption>
      </Select>
      {value && (
        <Select
          aria-label="Action target"
          value={value.target}
          onValueChange={(target) => onChange({ ...value, target })}
        >
          {(value.type === "form" ? forms : services).map((item) => (
            <SelectOption key={item.id} value={item.id}>
              {item.title}
              {"status" in item && item.status === "Draft" ? " · Draft" : ""}
            </SelectOption>
          ))}
        </Select>
      )}
    </div>
  );
}
