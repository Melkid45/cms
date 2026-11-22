"use client";
import type { CmsForm, CmsFormField } from "@/lib/builder/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { EditorDisclosure } from "./editor-disclosure";
import { MediaPicker } from "./media-picker";
const typeLabels = {
  text: "Text",
  email: "Email",
  tel: "Phone",
  textarea: "Long text",
  select: "Select",
  checkbox: "Checkbox",
  date: "Date",
  number: "Number",
};
function Control({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
export function InlineFormEditor({
  value,
  onChange,
  contentOnly = false,
  showImage = true,
}: {
  value: CmsForm;
  onChange: (form: CmsForm) => void;
  contentOnly?: boolean;
  showImage?: boolean;
}) {
  const update = (patch: Partial<CmsForm>) => onChange({ ...value, ...patch });
  const fieldUpdate = (id: string, patch: Partial<CmsFormField>) =>
    update({
      fields: value.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Control label="Heading">
            <Textarea
              value={value.title}
              onChange={(e) => update({ title: e.target.value })}
              rows={2}
            />
          </Control>
        </div>
        <div className="sm:col-span-2">
          <Control label="Description">
            <Textarea
              value={value.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Control>
        </div>
        <Control label="Button text">
          <Input
            value={value.buttonLabel}
            onChange={(e) => update({ buttonLabel: e.target.value })}
          />
        </Control>
        {!contentOnly && (
          <Control label="Columns">
            <Select
              value={String(value.columns || 2)}
              onValueChange={(v) => update({ columns: Number(v) as 1 | 2 | 3 })}
            >
              <SelectOption value="1">1 column</SelectOption>
              <SelectOption value="2">2 columns</SelectOption>
              <SelectOption value="3">3 columns</SelectOption>
            </Select>
          </Control>
        )}
      </div>
      {showImage && value.layout === "split" && (
        <div className="space-y-2">
          <Label>Photo</Label>
          <MediaPicker
            value={value.image}
            onChange={(image) => update({ image })}
          />
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Fields</h3>
        {!contentOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value.fields.length >= 30}
            onClick={() => {
              let n = value.fields.length + 1;
              while (value.fields.some((f) => f.name === `field_${n}`)) n++;
              update({
                fields: [
                  ...value.fields,
                  {
                    id: crypto.randomUUID(),
                    type: "text",
                    name: `field_${n}`,
                    label: "New field",
                    placeholder: "",
                    required: false,
                    width: "half",
                    options: [],
                  },
                ],
              });
            }}
          >
            <Plus />
            Add field
          </Button>
        )}
      </div>
      {value.fields.map((field, index) => (
        <EditorDisclosure
          key={field.id}
          title={
            <span className="flex items-center gap-3">
              <span>{field.label}</span>
              <span className="text-xs font-normal text-neutral-400">
                {typeLabels[field.type]}
              </span>
            </span>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Control label="Label">
                <Input
                  value={field.label}
                  onChange={(e) =>
                    fieldUpdate(field.id, { label: e.target.value })
                  }
                />
              </Control>
              <Control label="Placeholder">
                <Input
                  value={field.placeholder}
                  onChange={(e) =>
                    fieldUpdate(field.id, { placeholder: e.target.value })
                  }
                />
              </Control>
              {!contentOnly && (
                <>
                  <Control label="Field type">
                    <Select
                      value={field.type}
                      onValueChange={(v) =>
                        fieldUpdate(field.id, {
                          type: v as CmsFormField["type"],
                          options:
                            v === "select" && !field.options.length
                              ? ["Option 1", "Option 2"]
                              : field.options,
                        })
                      }
                    >
                      {Object.entries(typeLabels).map(([id, label]) => (
                        <SelectOption key={id} value={id}>
                          {label}
                        </SelectOption>
                      ))}
                    </Select>
                  </Control>
                  <Control label="Width">
                    <Select
                      value={field.width}
                      onValueChange={(v) =>
                        fieldUpdate(field.id, {
                          width: v as CmsFormField["width"],
                        })
                      }
                    >
                      <SelectOption value="half">One column</SelectOption>
                      <SelectOption value="full">Full row</SelectOption>
                    </Select>
                  </Control>
                  <Control label="Field name">
                    <Input
                      value={field.name}
                      onChange={(e) =>
                        fieldUpdate(field.id, { name: e.target.value })
                      }
                    />
                  </Control>
                  <label className="flex items-center gap-3 text-sm">
                    <Switch
                      checked={field.required}
                      onCheckedChange={(required) =>
                        fieldUpdate(field.id, { required })
                      }
                    />
                    Required
                  </label>
                </>
              )}
              {field.type === "select" && (
                <div className="sm:col-span-2">
                  <Control label="Options · one per line">
                    <Textarea
                      value={field.options.join("\n")}
                      onChange={(e) =>
                        fieldUpdate(field.id, {
                          options: e.target.value.split("\n"),
                        })
                      }
                    />
                  </Control>
                </div>
              )}
            </div>
            {!contentOnly && (
              <div className="flex items-center justify-between border-t pt-3">
                <div className="flex gap-1">
                  {[-1, 1].map((direction) => (
                    <Button
                      key={direction}
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        direction < 0 ? "Move field up" : "Move field down"
                      }
                      disabled={
                        index + direction < 0 ||
                        index + direction >= value.fields.length
                      }
                      onClick={() => {
                        const fields = [...value.fields];
                        [fields[index], fields[index + direction]] = [
                          fields[index + direction],
                          fields[index],
                        ];
                        update({ fields });
                      }}
                    >
                      {direction < 0 ? <ArrowUp /> : <ArrowDown />}
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={value.fields.length === 1}
                  onClick={() =>
                    update({
                      fields: value.fields.filter((f) => f.id !== field.id),
                    })
                  }
                >
                  <Trash2 />
                  Remove
                </Button>
              </div>
            )}
          </div>
        </EditorDisclosure>
      ))}
    </div>
  );
}
