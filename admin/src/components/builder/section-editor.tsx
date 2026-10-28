"use client";
import { definition } from "@/lib/builder/catalog";
import { collectionItems, newCollectionItem } from "@/lib/builder/collections";
import type { Section, Field, CollectionItem } from "@/lib/builder/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Plus, Copy, Trash2 } from "lucide-react";
import { MediaPicker } from "./media-picker";
function Fields({
  fields,
  values,
  id,
  onChange,
}: {
  fields: Field[];
  values: Record<string, string>;
  id: string;
  onChange: (values: Record<string, string>) => void;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {fields.map((field) => (
        <div
          key={field.key}
          className={
            ["image", "heading", "textarea"].includes(field.type)
              ? "space-y-2 sm:col-span-2"
              : "space-y-2"
          }
        >
          <Label htmlFor={`${id}-${field.key}`}>{field.label}</Label>
          {field.type === "image" ? (
            <MediaPicker
              value={values[field.key] ?? field.value}
              onChange={(value) => onChange({ ...values, [field.key]: value })}
            />
          ) : ["heading", "textarea"].includes(field.type) ? (
            <Textarea
              id={`${id}-${field.key}`}
              value={values[field.key] ?? field.value}
              rows={field.type === "heading" ? 2 : 3}
              maxLength={20000}
              onChange={(e) =>
                onChange({ ...values, [field.key]: e.target.value })
              }
            />
          ) : (
            <Input
              id={`${id}-${field.key}`}
              value={values[field.key] ?? field.value}
              maxLength={2000}
              onChange={(e) =>
                onChange({ ...values, [field.key]: e.target.value })
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
function category(field: Field) {
  if (field.type === "url" || field.role === "Button / link label")
    return "Buttons & links";
  if (field.type === "image" || field.label === "Image description")
    return "Images";
  if (
    ["Main heading", "Display text", "Eyebrow", "Description"].includes(
      field.role || "",
    )
  )
    return "Heading & introduction";
  return field.group === "Content" ? "Additional content" : field.group;
}
export function SectionEditor({
  section,
  onChange,
  contentOnly = false,
}: {
  section: Section;
  onChange: (section: Section) => void;
  contentOnly?: boolean;
}) {
  const entry = definition(section.variant);
  if (!entry) return null;
  const repeaters = entry.repeaters || [];
  const repeatedKeys = new Set(
    repeaters.flatMap((group) => group.items.flatMap((item) => item.fields)),
  );
  const main = entry.fields.filter((field) => !repeatedKeys.has(field.key));
  const categories = [...new Set(main.map(category))];
  return (
    <div className="space-y-4">
      {categories.map((name, index) => (
        <details
          key={name}
          open={index === 0}
          className="rounded-lg border bg-white"
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            {name}
          </summary>
          <div className="border-t p-4">
            <Fields
              id={section.id}
              fields={main.filter((f) => category(f) === name)}
              values={section.values}
              onChange={(values) => onChange({ ...section, values })}
            />
          </div>
        </details>
      ))}
      {repeaters.map((group) => {
        const items = collectionItems(section, entry, group);
        const update = (items: CollectionItem[]) =>
          onChange({
            ...section,
            collections: { ...section.collections, [group.id]: items },
          });
        return (
          <div
            key={group.id}
            className="space-y-3 rounded-xl border bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {group.label} · {items.length}
              </h3>
              {!contentOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={items.length >= 30}
                  onClick={() =>
                    update([...items, newCollectionItem(entry, group)])
                  }
                >
                  <Plus />
                  Add item
                </Button>
              )}
            </div>
            {items.map((item, index) => {
              const keys = group.items[item.template].fields;
              const fields = entry.fields.filter((f) => keys.includes(f.key));
              const title =
                fields.find((f) => f.type === "heading") ||
                fields.find((f) => f.role === "Button / link label") ||
                fields.find((f) => f.type === "textarea") ||
                fields.find((f) => f.type === "text");
              return (
                <details
                  key={item.id}
                  open={index === 0}
                  className="rounded-lg border"
                >
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                    {index + 1}.{" "}
                    {(title ? (item.values[title.key] ?? title.value) : "Image")
                      .replace(/\n/g, " ")
                      .slice(0, 70) || "New item"}
                  </summary>
                  <div className="space-y-4 border-t p-4">
                    {!contentOnly && (
                      <div className="flex justify-end gap-1">
                        {[-1, 1].map((direction) => (
                          <Button
                            type="button"
                            key={direction}
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Move item ${index + 1} ${direction < 0 ? "up" : "down"}`}
                            disabled={
                              index + direction < 0 ||
                              index + direction >= items.length
                            }
                            onClick={() => {
                              const next = [...items];
                              [next[index], next[index + direction]] = [
                                next[index + direction],
                                next[index],
                              ];
                              update(next);
                            }}
                          >
                            {direction < 0 ? <ArrowUp /> : <ArrowDown />}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Duplicate item ${index + 1}`}
                          disabled={items.length >= 30}
                          onClick={() =>
                            update([
                              ...items.slice(0, index + 1),
                              {
                                ...structuredClone(item),
                                id: crypto.randomUUID(),
                              },
                              ...items.slice(index + 1),
                            ])
                          }
                        >
                          <Copy />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove item ${index + 1}`}
                          disabled={items.length <= 1}
                          onClick={() =>
                            update(items.filter((i) => i.id !== item.id))
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                    <Fields
                      id={`${section.id}-${item.id}`}
                      fields={fields}
                      values={item.values}
                      onChange={(values) =>
                        update(
                          items.map((i) =>
                            i.id === item.id ? { ...i, values } : i,
                          ),
                        )
                      }
                    />
                  </div>
                </details>
              );
            })}
            {!contentOnly && (
              <p className="text-xs text-neutral-400">
                1–30 items. Remove, duplicate or reorder without changing the
                layout.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
