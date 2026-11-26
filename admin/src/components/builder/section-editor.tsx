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
import { EditorDisclosure } from "./editor-disclosure";
import {
  fieldEditable,
  collectionEditable,
  defaultSectionAccess,
  allowedCollectionIds,
} from "@/lib/builder/section-info";
import { useProject } from "@/lib/builder/client";
import { Select, SelectOption } from "@/components/ui/select";
import { InlineFormEditor } from "./inline-form-editor";
import { defaultForm } from "@/lib/builder/form-defaults";
import { ActionPicker, BlockFormsContext } from "./action-picker";
import type { ContentAction } from "@/lib/builder/types";
import { Switch } from "@/components/ui/switch";
function Fields({
  fields,
  values,
  id,
  onChange,
  actions,
  onAction,
}: {
  actions?: Record<string, ContentAction>;
  onAction?: (key: string, action: ContentAction | undefined) => void;
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
            ["image", "video", "heading", "textarea"].includes(field.type)
              ? "space-y-2 sm:col-span-2"
              : "space-y-2"
          }
        >
          <Label htmlFor={`${id}-${field.key}`}>{field.label}</Label>
          {field.type === "url" && onAction && (
            <ActionPicker
              value={actions?.[field.key]}
              onChange={(action) => onAction(field.key, action)}
            />
          )}
          {actions?.[field.key] ? null : field.type === "image" || field.type === "video" ? (
            <MediaPicker
              kind={field.type}
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
  if (field.type === "image" || field.type === "video" || field.label === "Image description")
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
  availableSections = [],
}: {
  section: Section;
  onChange: (section: Section) => void;
  contentOnly?: boolean;
  availableSections?: Section[];
}) {
  const { project } = useProject();
  const entry = definition(section.variant);
  if (!entry) return null;
  const inlineForms = [
    ...new Map(
      [
        ...(project?.pages.flatMap((p) => p.sections) || []),
        ...availableSections,
        section,
      ]
        .filter((s) => !s.hidden && s.form)
        .map((s) => [s.form!.id, s.form!]),
    ).values(),
  ];
  const forms = [
    ...inlineForms,
    ...(project?.formDefinitions || []).filter(
      (f) => !inlineForms.some((i) => i.id === f.id),
    ),
  ];
  if (contentOnly && section.form && section.clientAccess?.text === false)
    return section.clientAccess?.images === false ? (
      <p className="text-sm text-neutral-500">
        This form is managed by your administrator.
      </p>
    ) : (
      <MediaPicker
        value={section.form.image}
        onChange={(image) =>
          onChange({ ...section, form: { ...section.form!, image } })
        }
      />
    );
  if (entry.family === "form")
    return <div className="space-y-5"><InlineFormEditor
        value={section.form || defaultForm(section.id,section.variant === "form-v2")}
        onChange={form=>onChange({...section,form})} contentOnly={contentOnly}
        showImage={!contentOnly || section.clientAccess?.images !== false}/>
        {entry.fields.length > 0 && <EditorDisclosure title="Contact details"><Fields id={section.id} fields={entry.fields.filter(f=>!contentOnly || fieldEditable(section,f))} values={section.values} onChange={values=>onChange({...section,values})}/></EditorDisclosure>}
      </div>;

  const repeaters = (entry.repeaters || []).filter(
    (group) =>
      !contentOnly ||
      group.items.some((item) =>
        item.fields.some((key) => {
          const field = entry.fields.find((field) => field.key === key);
          return field && fieldEditable(section, field);
        }),
      ),
  );
  const repeatedKeys = new Set(
    repeaters.flatMap((group) => group.items.flatMap((item) => item.fields)),
  );
  const replacedKeys = new Set<string>();
  const walkForm = (
    nodes: import("@/lib/builder/types").TemplateNode[],
    inside = false,
  ) => {
    for (const node of nodes) {
      const active = inside || node.tag === "form";
      if (active) {
        if (node.field) replacedKeys.add(node.field);
        Object.values(node.bindings || {}).forEach((key) =>
          replacedKeys.add(key),
        );
      }
      walkForm(node.children || [], active);
    }
  };
  if (section.form) walkForm(entry.nodes);
  const visible = entry.fields.filter(
    (field) =>
      !replacedKeys.has(field.key) &&
      (!contentOnly || fieldEditable(section, field)),
  );
  const main = visible.filter((field) => !repeatedKeys.has(field.key));
  const categories = [...new Set(main.map(category))];
  return (
    <BlockFormsContext.Provider value={forms}>
      <div className="space-y-4">
        {section.form && (
          <InlineFormEditor
            value={section.form}
            onChange={(form) => onChange({ ...section, form })}
            contentOnly={contentOnly}
            showImage={!contentOnly || section.clientAccess?.images !== false}
          />
        )}
        {!section.form &&
          !contentOnly &&
          JSON.stringify(entry.nodes).includes('"tag":"form"') && (
            <div className="space-y-3 rounded-xl border bg-white p-4">
              <p className="text-sm font-medium">Form fields</p>
              {section.formId ? (
                <p className="text-sm text-neutral-500">
                  This block uses an existing form. Customize it here to keep
                  the changes with this section.
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onChange({
                    ...section,
                    form: {...structuredClone(
                      project?.formDefinitions?.find(
                        (f) => f.id === section.formId,
                      ) || defaultForm(section.id),
                    ),id:section.id},
                    formId: undefined,
                  })
                }
              >
                Customize fields
              </Button>
            </div>
          )}
        {contentOnly && !visible.length && (
          <p className="text-sm text-neutral-500">
            These fields are managed by your administrator.
          </p>
        )}
        {!contentOnly && (
          <label className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 text-sm">
            <span className="font-medium">Background</span>
            <Select
              aria-label="Section background"
              value={String(section.tone || "")}
              onValueChange={(selectedValue) =>
                onChange({
                  ...section,
                  tone: (selectedValue || undefined) as Section["tone"],
                })}
              className="h-9 max-w-48"
            >
              <SelectOption value="">Page background</SelectOption>
              <SelectOption value="tint">Tinted</SelectOption>
              <SelectOption value="dark">Dark</SelectOption>
              <SelectOption value="accent">Accent colour</SelectOption>
            </Select>
          </label>
        )}
        {categories.map((name, index) => (
          <EditorDisclosure key={name} defaultOpen={index === 0} title={name}>
            <Fields
              id={section.id}
              fields={main.filter((f) => category(f) === name)}
              values={section.values}
              actions={section.actions}
              onAction={
                contentOnly
                  ? undefined
                  : (key, action) => {
                      const actions = { ...section.actions };
                      if (action) actions[key] = action;
                      else delete actions[key];
                      onChange({ ...section, actions });
                    }
              }
              onChange={(values) => onChange({ ...section, values })}
            />
          </EditorDisclosure>
        ))}
        {repeaters.map((group) => {
          const items = collectionItems(section, entry, group);
          const limit = group.max ?? 30;
          const canManage =
            !contentOnly || collectionEditable(section, entry, group);
          const allEditable = group.items.every((item) =>
            item.fields.every((key) => {
              const field = entry.fields.find((f) => f.key === key);
              return !!field && fieldEditable(section, field);
            }),
          );
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
                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={items.length >= limit}
                    onClick={() =>
                      update([...items, newCollectionItem(entry, group)])
                    }
                  >
                    <Plus />
                    Add item
                  </Button>
                )}
              </div>
              {!contentOnly && (
                <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
                  <label className="flex items-center justify-between gap-4 text-xs">
                    <span>Client can add, remove and reorder items</span>
                    <Switch
                      disabled={!allEditable}
                      checked={collectionEditable(section, entry, group)}
                      onCheckedChange={(checked) => {
                        const access =
                          section.clientAccess || defaultSectionAccess;
                        const groups = allowedCollectionIds(section, entry);
                        onChange({
                          ...section,
                          clientAccess: {
                            ...access,
                            collections: checked
                              ? [
                                  ...groups.filter((id) => id !== group.id),
                                  group.id,
                                ]
                              : groups.filter((id) => id !== group.id),
                          },
                        });
                      }}
                    />
                  </label>
                  {!allEditable && (
                    <p className="text-xs text-neutral-500">
                      Enable editing for this list’s text and images before
                      allowing item changes.
                    </p>
                  )}
                </div>
              )}
              {items.map((item, index) => {
                const keys = group.items[item.template].fields;
                const fields = visible.filter(
                  (f) =>
                    keys.includes(f.key) &&
                    // Services items: without service settings the button keeps its own link;
                    // a service preview replaces the link; "Hide the button" hides both.
                    !(
                      entry.family === "services" &&
                      item.detail &&
                      (f.type === "url" ||
                        (item.detail.mode === "none" &&
                          f.role === "Button / link label"))
                    ),
                );
                if (contentOnly && !fields.length) return null;
                const title =
                  fields.find((f) => f.type === "heading") ||
                  fields.find((f) => f.role === "Button / link label") ||
                  fields.find((f) => f.type === "textarea") ||
                  fields.find((f) => f.type === "text");
                return (
                  <EditorDisclosure
                    key={item.id}
                    defaultOpen={index === 0}
                    title={
                      <>
                        {index + 1}.{" "}
                        {(title
                          ? (item.values[title.key] ?? title.value)
                          : "Image"
                        )
                          .replace(/\n/g, " ")
                          .slice(0, 70) || "New item"}
                      </>
                    }
                  >
                    <div className="space-y-4">
                      {!contentOnly && entry.family === "services" && (
                        <div className="space-y-3 rounded-lg bg-neutral-50 p-3">
                          <Label>Service preview</Label>
                          <Select
                            value={item.detail?.mode || "link"}
                            onValueChange={(mode) =>
                              update(
                                items.map((i) =>
                                  i.id === item.id && mode === "link"
                                    ? (() => {
                                        const rest = { ...i };
                                        delete rest.detail;
                                        return rest;
                                      })()
                                    : i.id === item.id
                                    ? {
                                        ...i,
                                        detail: {
                                          body: i.detail?.body || "",
                                          formId: i.detail?.formId || "",
                                          mode: mode as NonNullable<
                                            CollectionItem["detail"]
                                          >["mode"],
                                        },
                                      }
                                    : i,
                                ),
                              )
                            }
                          >
                            <SelectOption value="link">Use the button link</SelectOption>
                            <SelectOption value="none">Hide the button</SelectOption>
                            <SelectOption value="modal">
                              Centered modal
                            </SelectOption>
                            <SelectOption value="drawer">
                              Side panel
                            </SelectOption>
                            <SelectOption value="page">
                              Separate page
                            </SelectOption>
                            <SelectOption value="editorial">
                              Editorial page
                            </SelectOption>
                          </Select>
                          {item.detail && item.detail.mode !== "none" && (
                            <>
                              <Label htmlFor={`${item.id}-detail`}>
                                Full description
                              </Label>
                              <Textarea
                                id={`${item.id}-detail`}
                                rows={5}
                                value={item.detail.body}
                                onChange={(e) =>
                                  update(
                                    items.map((i) =>
                                      i.id === item.id
                                        ? {
                                            ...i,
                                            detail: {
                                              ...item.detail!,
                                              body: e.target.value,
                                            },
                                          }
                                        : i,
                                    ),
                                  )
                                }
                              />
                              <Label>Enquiry button</Label>
                              <Select
                                value={item.detail.formId || "none"}
                                onValueChange={(id) =>
                                  update(
                                    items.map((i) =>
                                      i.id === item.id
                                        ? {
                                            ...i,
                                            detail: {
                                              ...item.detail!,
                                              formId: id === "none" ? "" : id,
                                            },
                                          }
                                        : i,
                                    ),
                                  )
                                }
                              >
                                <SelectOption value="none">
                                  No button
                                </SelectOption>
                                {forms.map((f) => (
                                  <SelectOption key={f.id} value={f.id}>
                                    {f.title}
                                  </SelectOption>
                                ))}
                              </Select>
                            </>
                          )}
                        </div>
                      )}
                      {contentOnly &&
                        item.detail &&
                        item.detail.mode !== "none" &&
                        section.clientAccess?.text !== false && (
                          <div className="space-y-2">
                            <Label htmlFor={`${item.id}-detail`}>
                              Full description
                            </Label>
                            <Textarea
                              id={`${item.id}-detail`}
                              rows={5}
                              value={item.detail.body}
                              onChange={(e) =>
                                update(
                                  items.map((i) =>
                                    i.id === item.id
                                      ? {
                                          ...i,
                                          detail: {
                                            ...item.detail!,
                                            body: e.target.value,
                                          },
                                        }
                                      : i,
                                  ),
                                )
                              }
                            />
                          </div>
                        )}
                      {canManage && (
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
                            disabled={items.length >= limit}
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
                        actions={item.actions}
                        onAction={
                          contentOnly
                            ? undefined
                            : (key, action) => {
                                const actions = { ...item.actions };
                                if (action) actions[key] = action;
                                else delete actions[key];
                                update(
                                  items.map((i) =>
                                    i.id === item.id ? { ...i, actions } : i,
                                  ),
                                );
                              }
                        }
                        onChange={(values) =>
                          update(
                            items.map((i) =>
                              i.id === item.id ? { ...i, values } : i,
                            ),
                          )
                        }
                      />
                    </div>
                  </EditorDisclosure>
                );
              })}
              {canManage && (
                <p className="text-xs text-neutral-400">
                  1–{limit} items. Remove, duplicate or reorder without changing
                  the layout.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </BlockFormsContext.Provider>
  );
}
