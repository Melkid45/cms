"use client";
import "./connected-content.scss";
import { useState } from "react";
import { useProject } from "@/lib/builder/client";
import type { CmsForm, CmsFormField, CmsService } from "@/lib/builder/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, ArrowUp, ArrowDown, Copy, Check } from "lucide-react";
import { MediaPicker } from "./media-picker";
import { SchemaForm } from "./schema-form";
const uid = () => crypto.randomUUID();
const field = (
  type: CmsFormField["type"] = "text",
  name = "name",
  label = "Your name",
): CmsFormField => ({
  id: uid(),
  type,
  name,
  label,
  placeholder: "",
  required: true,
  width: "full",
  options: type === "select" ? ["Option 1", "Option 2"] : [],
});
const form = (): CmsForm => ({
  id: uid(),
  title: "Discuss your project",
  description: "Tell us a little about what you have in mind.",
  buttonLabel: "Send enquiry",
  layout: "compact",
  image: "",
  fields: [
    field(),
    field("email", "email", "Email"),
    field("textarea", "message", "Your message"),
  ],
});
const service = (): CmsService => {
  const id = uid();
  return {
    id,
    title: "New service",
    slug: `service-${id.slice(0, 8)}`,
    summary: "",
    body: "",
    image: "",
    imageAlt: "",
    mode: "modal",
    status: "Draft",
    formId: "",
  };
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
export function ContentManager({ kind }: { kind: "forms" | "services" }) {
  const { project, save, error: loadError } = useProject();
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<CmsForm | CmsService | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!project) return <p>{loadError || "Loading…"}</p>;
  const forms = project.formDefinitions || [];
  const services = project.services || [];
  const items = kind === "forms" ? forms : services;
  const current = draft || items.find((i) => i.id === selected);
  const change = (patch: Partial<CmsForm & CmsService>) => {
    if (current) {
      setDraft({ ...current, ...patch });
      setSaved(false);
    }
  };
  const persist = async (remove = false) => {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const next = items.filter((i) => i.id !== current.id);
      if (!remove) next.push(current);
      await save({
        ...project,
        [kind === "forms" ? "formDefinitions" : "services"]: next,
      });
      setDraft(null);
      setSelected(remove ? "" : current.id);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    if (draft && !confirm("Discard unsaved changes?")) return;
    const item = kind === "forms" ? form() : service();
    setSelected(item.id);
    setDraft(item);
    setSaved(false);
    setError("");
  };
  const currentForm = current && "fields" in current ? current : null;
  const currentService = current && "slug" in current ? current : null;
  const updateField = (id: string, patch: Partial<CmsFormField>) => {
    if (currentForm)
      change({
        fields: currentForm.fields.map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      });
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <Button className="w-full" onClick={add}>
          <Plus />
          New {kind === "forms" ? "form" : "service"}
        </Button>
        {items.map((item) => (
          <button
            key={item.id}
            className={`w-full rounded-xl border p-4 text-left text-sm transition-colors ${current?.id === item.id ? "border-black bg-white" : "border-transparent hover:bg-white"}`}
            onClick={() => {
              if (draft && !confirm("Discard unsaved changes?")) return;
              setSelected(item.id);
              setDraft(null);
              setSaved(false);
              setError("");
            }}
          >
            <strong className="block">{item.title}</strong>
            <span className="mt-1 block text-xs text-neutral-500">
              {"fields" in item
                ? `${item.fields.length} fields · ${item.layout}`
                : `${item.status} · ${item.mode}`}
            </span>
          </button>
        ))}
        {!items.length && (
          <p className="p-4 text-sm text-neutral-500">
            Create your first{" "}
            {kind === "forms"
              ? "form and connect it to a button or contact block."
              : "service, then choose it in a service card’s link settings."}
          </p>
        )}
      </aside>
      {current ? (
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{current.title}</h2>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  const copy = {
                    ...structuredClone(current),
                    id: uid(),
                    title: `${current.title} copy`,
                  };
                  if ("slug" in copy)
                    copy.slug += "-copy-" + copy.id.slice(0, 4);
                  setDraft(copy);
                  setSelected(copy.id);
                  setSaved(false);
                }}
              >
                <Copy />
                Duplicate
              </Button>
              <Button disabled={busy} onClick={() => void persist()}>
                {saved ? <Check /> : null}
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm text-green-700">
              Saved.
            </p>
          )}
          <div className="grid gap-5 rounded-2xl border bg-white p-6 md:grid-cols-2">
            <Control label="Title">
              <Input
                value={current.title}
                maxLength={200}
                onChange={(e) => change({ title: e.target.value })}
              />
            </Control>
            {currentForm && (
              <Control label="Layout">
                <Select
                  value={currentForm.layout}
                  onValueChange={(v) =>
                    change({ layout: v as CmsForm["layout"] })
                  }
                >
                  <SelectOption value="compact">Simple form</SelectOption>
                  <SelectOption value="split">Form with image</SelectOption>
                </Select>
              </Control>
            )}
            {currentService && (
              <>
                <Control label="Slug">
                  <Input
                    value={currentService.slug}
                    onChange={(e) => change({ slug: e.target.value })}
                  />
                </Control>
                <Control label="Open as">
                  <Select
                    value={currentService.mode}
                    onValueChange={(v) =>
                      change({ mode: v as CmsService["mode"] })
                    }
                  >
                    {["modal", "drawer", "page", "editorial"].map((v) => (
                      <SelectOption key={v} value={v}>
                        {
                          {
                            modal: "Centered modal",
                            drawer: "Side panel",
                            page: "Detail page",
                            editorial: "Editorial page",
                          }[v as CmsService["mode"]]
                        }
                      </SelectOption>
                    ))}
                  </Select>
                </Control>
                <Control label="Status">
                  <Select
                    value={currentService.status}
                    onValueChange={(v) =>
                      change({ status: v as CmsService["status"] })
                    }
                  >
                    <SelectOption value="Draft">Draft</SelectOption>
                    <SelectOption value="Published">Published</SelectOption>
                  </Select>
                </Control>
                <Control label="Enquiry form">
                  <Select
                    value={currentService.formId || "none"}
                    onValueChange={(v) =>
                      change({ formId: v === "none" ? "" : v })
                    }
                  >
                    <SelectOption value="none">No form</SelectOption>
                    {forms.map((f) => (
                      <SelectOption key={f.id} value={f.id}>
                        {f.title}
                      </SelectOption>
                    ))}
                  </Select>
                </Control>
              </>
            )}
            <div className="md:col-span-2">
              <Control
                label={currentForm ? "Description" : "Short description"}
              >
                <Textarea
                  value={
                    currentForm?.description ?? currentService?.summary ?? ""
                  }
                  maxLength={2000}
                  onChange={(e) =>
                    change(
                      currentForm
                        ? { description: e.target.value }
                        : { summary: e.target.value },
                    )
                  }
                />
              </Control>
            </div>
            {currentService && (
              <div className="md:col-span-2">
                <Control label="Full description">
                  <Textarea
                    rows={8}
                    value={currentService.body}
                    onChange={(e) => change({ body: e.target.value })}
                  />
                </Control>
              </div>
            )}
            {currentForm && (
              <Control label="Submit button">
                <Input
                  value={currentForm.buttonLabel}
                  maxLength={100}
                  onChange={(e) => change({ buttonLabel: e.target.value })}
                />
              </Control>
            )}
            {(currentService || currentForm?.layout === "split") && (
              <div className="md:col-span-2">
                <Control label="Image">
                  <MediaPicker
                    value={current.image}
                    onChange={(image) => change({ image })}
                  />
                </Control>
              </div>
            )}
            {currentService && (
              <Control label="Image description">
                <Input
                  value={currentService.imageAlt}
                  onChange={(e) => change({ imageAlt: e.target.value })}
                />
              </Control>
            )}
          </div>
          {currentForm && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Fields</h3>
                <Button
                  variant="outline"
                  disabled={currentForm.fields.length >= 30}
                  onClick={() =>
                    change({
                      fields: [
                        ...currentForm.fields,
                        field(
                          "text",
                          `field_${currentForm.fields.length + 1}`,
                          "New field",
                        ),
                      ],
                    })
                  }
                >
                  <Plus />
                  Add field
                </Button>
              </div>
              {currentForm.fields.map((f, index) => (
                <div
                  className="space-y-4 rounded-2xl border bg-white p-5"
                  key={f.id}
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-sm">
                      {index + 1}. {f.label}
                    </strong>
                    <div className="flex gap-1">
                      {[-1, 1].map((d) => (
                        <Button
                          key={d}
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            d < 0 ? "Move field up" : "Move field down"
                          }
                          disabled={
                            index + d < 0 ||
                            index + d >= currentForm.fields.length
                          }
                          onClick={() => {
                            const fields = [...currentForm.fields];
                            [fields[index], fields[index + d]] = [
                              fields[index + d],
                              fields[index],
                            ];
                            change({ fields });
                          }}
                        >
                          {d < 0 ? <ArrowUp /> : <ArrowDown />}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove field"
                        disabled={currentForm.fields.length === 1}
                        onClick={() =>
                          change({
                            fields: currentForm.fields.filter(
                              (v) => v.id !== f.id,
                            ),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Control label="Label">
                      <Input
                        value={f.label}
                        onChange={(e) =>
                          updateField(f.id, { label: e.target.value })
                        }
                      />
                    </Control>
                    <Control label="Field name">
                      <Input
                        value={f.name}
                        onChange={(e) =>
                          updateField(f.id, { name: e.target.value })
                        }
                      />
                    </Control>
                    <Control label="Type">
                      <Select
                        value={f.type}
                        onValueChange={(v) =>
                          updateField(f.id, {
                            type: v as CmsFormField["type"],
                            options:
                              v === "select" && !f.options.length
                                ? ["Option 1", "Option 2"]
                                : f.options,
                          })
                        }
                      >
                        {[
                          "text",
                          "email",
                          "tel",
                          "textarea",
                          "select",
                          "checkbox",
                          "date",
                          "number",
                        ].map((v) => (
                          <SelectOption key={v} value={v}>
                            {v}
                          </SelectOption>
                        ))}
                      </Select>
                    </Control>
                    <Control label="Width">
                      <Select
                        value={f.width}
                        onValueChange={(v) =>
                          updateField(f.id, {
                            width: v as CmsFormField["width"],
                          })
                        }
                      >
                        <SelectOption value="full">Full row</SelectOption>
                        <SelectOption value="half">Half row</SelectOption>
                      </Select>
                    </Control>
                    <Control label="Placeholder">
                      <Input
                        value={f.placeholder}
                        onChange={(e) =>
                          updateField(f.id, { placeholder: e.target.value })
                        }
                      />
                    </Control>
                    <label className="flex items-center gap-3 text-sm">
                      <Switch
                        checked={f.required}
                        onCheckedChange={(required) =>
                          updateField(f.id, { required })
                        }
                      />
                      Required
                    </label>
                    {f.type === "select" && (
                      <div className="sm:col-span-2">
                        <Control label="Options · one per line">
                          <Textarea
                            value={f.options.join("\n")}
                            onChange={(e) =>
                              updateField(f.id, {
                                options: e.target.value.split("\n"),
                              })
                            }
                          />
                        </Control>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border bg-white p-6">
                <h3 className="mb-5 font-semibold">Preview</h3>
                <SchemaForm definition={currentForm} />
              </div>
            </>
          )}
          <Button
            variant="ghost"
            className="text-red-600"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "Delete this item? Connected items must be unlinked first.",
                )
              )
                void persist(true);
            }}
          >
            <Trash2 />
            Delete {kind === "forms" ? "form" : "service"}
          </Button>
        </div>
      ) : (
        <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed text-sm text-neutral-500">
          Choose an item or create a new one.
        </div>
      )}
    </div>
  );
}
