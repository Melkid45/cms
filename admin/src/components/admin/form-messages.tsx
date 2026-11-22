"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOCALE_NAMES, siteLanguages } from "@/lib/builder/i18n";
import type { FormSettings, Project } from "@/lib/builder/types";

// Confirmation text for every other enabled language of a multilingual website.
// Empty = a built-in "Thank you" in that language.
export function FormMessageFields({
  project,
  forms,
  onChange,
}: {
  project: Pick<Project, "languages">;
  forms: FormSettings;
  onChange: (forms: FormSettings) => void;
}) {
  const languages = siteLanguages(project);
  if (!languages) return null;
  return (
    <>
      {languages.enabled
        .filter((code) => code !== languages.default)
        .map((code) => (
          <div key={code} className="space-y-2">
            <Label htmlFor={`form-success-${code}`}>
              Confirmation message · {LOCALE_NAMES[code] || code}
            </Label>
            <Input
              id={`form-success-${code}`}
              maxLength={500}
              placeholder="Built-in thank-you text in this language"
              value={forms.messages?.[code] || ""}
              onChange={(event) =>
                onChange({
                  ...forms,
                  messages: { ...forms.messages, [code]: event.target.value },
                })
              }
            />
          </div>
        ))}
      <p className="text-xs leading-5 text-neutral-500">
        The first message is used on pages in the default language (
        {LOCALE_NAMES[languages.default]}).
      </p>
    </>
  );
}
