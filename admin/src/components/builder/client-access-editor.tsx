"use client";
import type { CmsPage, Section } from "@/lib/builder/types";
import { definition } from "@/lib/builder/catalog";
import { defaultSectionAccess } from "@/lib/builder/section-info";
import { Switch } from "@/components/ui/switch";
import { EditorDisclosure } from "./editor-disclosure";
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
export function SectionClientAccess({
  section,
  onChange,
}: {
  section: Section;
  onChange: (section: Section) => void;
}) {
  const access = section.clientAccess || defaultSectionAccess;
  return (
    <EditorDisclosure title="Client permissions">
      <div className="space-y-4">
        <Toggle
          label="Edit text and links"
          checked={access.text}
          onChange={(text) =>
            onChange({ ...section, clientAccess: { ...access, text } })
          }
        />
        <Toggle
          label="Change images and alt text"
          checked={access.images}
          onChange={(images) =>
            onChange({ ...section, clientAccess: { ...access, images } })
          }
        />
        <Toggle
          label="Move this section"
          checked={access.reorder}
          onChange={(reorder) =>
            onChange({ ...section, clientAccess: { ...access, reorder } })
          }
        />
        <p className="pt-2 text-xs text-neutral-500">
          Lock individual fields for the client:
        </p>
        <div className="grid max-h-56 gap-3 overflow-y-auto sm:grid-cols-2">
          {definition(section.variant)?.fields.map((field) => (
            <label key={field.key} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={access.lockedFields.includes(field.key)}
                onChange={(e) =>
                  onChange({
                    ...section,
                    clientAccess: {
                      ...access,
                      lockedFields: e.target.checked
                        ? [...access.lockedFields, field.key]
                        : access.lockedFields.filter(
                            (key) => key !== field.key,
                          ),
                    },
                  })
                }
              />
              {field.role || field.label}{" "}
              <span className="text-neutral-400">{field.key}</span>
            </label>
          ))}
        </div>
      </div>
    </EditorDisclosure>
  );
}
export function PageClientAccess({
  page,
  onChange,
}: {
  page: CmsPage;
  onChange: (change: Partial<CmsPage>) => void;
}) {
  const access = page.clientAccess || { edit: true, publish: true };
  return (
    <div className="space-y-4 rounded-xl border bg-white p-5">
      <h3 className="text-sm font-semibold">Client access</h3>
      <Toggle
        label="Edit this page"
        checked={access.edit}
        onChange={(edit) => onChange({ clientAccess: { ...access, edit } })}
      />
      <Toggle
        label="Publish changes"
        checked={access.publish}
        onChange={(publish) =>
          onChange({ clientAccess: { ...access, publish } })
        }
      />
      <p className="text-xs leading-5 text-neutral-500">
        Saved permissions apply immediately. The website design remains
        protected.
      </p>
    </div>
  );
}
