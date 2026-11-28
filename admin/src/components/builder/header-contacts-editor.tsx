"use client";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import type { HeaderContact } from "@/lib/builder/types";
import { contactIcons, defaultContactIcon } from "./contact-icons";
import { headerContactHref } from "@/lib/builder/header-contacts";
export function HeaderContactsEditor({
  value,
  onChange,
}: {
  value: HeaderContact[];
  onChange: (value: HeaderContact[]) => void;
}) {
  const update = (id: string, patch: Partial<HeaderContact>) =>
    onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (i: number, delta: number) => {
    const next = [...value];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    onChange(next);
  };
  return (
    <section className="rounded-xl border bg-white p-6 space-y-4">
      <div>
        <h2 className="font-medium">Header contacts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Phone numbers, messengers and links. Empty contacts are hidden.
        </p>
      </div>
      {value.map((c, i) => (
        <div key={c.id} className="rounded-lg border p-4 space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span>Link type</span>
              <Select
                aria-label="Contact type"
                value={c.type}
                onValueChange={(v) =>
                  update(c.id, { type: v as HeaderContact["type"] })
                }
              >
                <SelectOption value="telegram">Telegram</SelectOption>
                <SelectOption value="whatsapp">WhatsApp</SelectOption>
                <SelectOption value="phone">Phone</SelectOption>
                <SelectOption value="link">Custom link</SelectOption>
              </Select>
            </label>
            <label className="space-y-2 text-sm">
              <span>Address or phone</span>
              <Input
                aria-label="Contact address"
                placeholder={
                  c.type === "telegram"
                    ? "@username"
                    : c.type === "link"
                      ? "https://example.com"
                      : "+7 999 123 45 67"
                }
                value={c.value}
                onChange={(e) => update(c.id, { value: e.target.value })}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>Label</span>
              <Input
                aria-label="Contact label"
                placeholder="Optional label"
                value={c.label}
                onChange={(e) => update(c.id, { label: e.target.value })}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>Display</span>
              <Select
                aria-label="Contact appearance"
                value={c.display}
                onValueChange={(v) =>
                  update(c.id, { display: v as HeaderContact["display"] })
                }
              >
                <SelectOption value="icon">Icon</SelectOption>
                <SelectOption value="text">Text</SelectOption>
                <SelectOption value="both">Icon & text</SelectOption>
              </Select>
            </label>
          </div>
          {c.display !== "text" && (
            <div className="space-y-2">
              <p className="text-sm">Icon</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(contactIcons).map(([key, Icon]) => (
                  <Button
                    key={key}
                    type="button"
                    size="icon"
                    title={key}
                    aria-label={`Choose ${key} icon`}
                    aria-pressed={
                      (c.icon || defaultContactIcon[c.type]) === key
                    }
                    variant={
                      (c.icon || defaultContactIcon[c.type]) === key
                        ? "secondary"
                        : "outline"
                    }
                    onClick={() => update(c.id, { icon: key })}
                  >
                    <Icon className="size-4" />
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg bg-neutral-50 px-4 py-3">
            <p className="mb-2 text-xs text-muted-foreground">Preview</p>
            <div className="inline-flex items-center gap-2 text-sm">
              {c.display !== "text" &&
                (() => {
                  const Icon =
                    contactIcons[
                      (c.icon ||
                        defaultContactIcon[c.type]) as keyof typeof contactIcons
                    ] || contactIcons.link;
                  return <Icon className="size-5" />;
                })()}
              {c.display !== "icon" && (c.label || c.value || "Contact")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-muted-foreground">
              {c.value && !headerContactHref(c)
                ? "Check the address or phone number"
                : headerContactHref(c)}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={i === 0}
              aria-label="Move contact up"
              onClick={() => move(i, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={i === value.length - 1}
              aria-label="Move contact down"
              onClick={() => move(i, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Remove contact"
              onClick={() => onChange(value.filter((x) => x.id !== c.id))}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={value.length >= 6}
        onClick={() =>
          onChange([
            ...value,
            {
              id: crypto.randomUUID(),
              type: "telegram",
              value: "",
              label: "",
              display: "icon",
            },
          ])
        }
      >
        <Plus />
        Add contact
      </Button>
    </section>
  );
}
