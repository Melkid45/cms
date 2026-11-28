"use client";
import { useState } from "react";
import { Select, SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  attributeValues,
  type CatalogAttribute,
} from "@/lib/builder/products/shared";
import { Plus, Trash2, X } from "lucide-react";
export function ProductAttributes({
  attributes,
  values,
  onChange,
}: {
  attributes: CatalogAttribute[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const [search, setSearch] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [creating, setCreating] = useState(false);
  const toggle = (key: string, value: string) => {
    const selected = attributeValues(values[key]);
    onChange({
      ...values,
      [key]: (selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
      ).join(" | "),
    });
  };
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium">Attributes</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose multiple values or type your own. Changes join the shared list
          when you save.
        </p>
      </div>
      {Object.entries(values).map(([key, value]) => {
        const a = attributes.find((a) => a.key === key),
          selected = attributeValues(value),
          query = (search[key] || "").trim();
        const options = [
          ...new Set([...(a?.values || []), ...selected]),
        ].filter((v) => v.toLowerCase().includes(query.toLowerCase()));
        return (
          <div key={key} className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{a?.label || key}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove attribute ${key}`}
                onClick={() => {
                  const next = { ...values };
                  delete next[key];
                  onChange(next);
                }}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant="secondary"
                  onClick={() => toggle(key, v)}
                  aria-label={`Remove ${v}`}
                >
                  {v}
                  <X className="size-3" />
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                aria-label={`Search or add ${key}`}
                placeholder="Search or add a value…"
                value={search[key] || ""}
                onChange={(e) =>
                  setSearch({ ...search, [key]: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (query && query.length <= 60 && !query.includes("|") && !selected.includes(query)) {
                      toggle(key, query);
                      setSearch({ ...search, [key]: "" });
                    }
                  }
                }}
              />
              <Button
                variant="outline"
                disabled={
                  !query ||
                  selected.includes(query) ||
                  query.includes("|") ||
                  query.length > 60
                }
                onClick={() => {
                  toggle(key, query);
                  setSearch({ ...search, [key]: "" });
                }}
              >
                <Plus />
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {options.map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={selected.includes(v) ? "secondary" : "outline"}
                  aria-pressed={selected.includes(v)}
                  onClick={() => toggle(key, v)}
                >
                  {selected.includes(v) ? "✓ " : ""}
                  {v}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <div className="min-w-48 flex-1">
          <Select
            aria-label="Add attribute"
            value=""
            onValueChange={(key) => {
              if (key === "__new") {
                setCreating(true);
                return;
              }
              if (key) onChange({ ...values, [key]: "" });
            }}
          >
            <SelectOption value="">Add attribute…</SelectOption>
            {attributes
              .filter((a) => !(a.key in values))
              .map((a) => (
                <SelectOption key={a.key} value={a.key}>
                  {a.label}
                </SelectOption>
              ))}
            <SelectOption value="__new">Create attribute…</SelectOption>
          </Select>
        </div>
        {creating && (
          <>
            <Input
              className="max-w-60"
              aria-label="New attribute key"
              placeholder="Key, e.g. material"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toLowerCase())}
            />
            <Button
              variant="outline"
              disabled={!/^[a-z0-9-]{1,40}$/.test(newKey) || newKey in values}
              onClick={() => {
                onChange({ ...values, [newKey]: "" });
                setCreating(false);
                setNewKey("");
              }}
            >
              Add attribute
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
