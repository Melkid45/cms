"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages, Link2, Plus, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectOption } from "@/components/ui/select";
import { saveProject } from "@/lib/builder/client";
import { LOCALE_NAMES, siteLanguages } from "@/lib/builder/i18n";
import type { CmsPage, Project } from "@/lib/builder/types";

// Page language + "Translations": link this page to its LV/RU/EN versions or
// create a copy to translate. Saved immediately as a structural change (same
// rules as creating pages: design roles only, checked again on the server).
export function PageTranslations({
  page,
  project,
  saved,
  onLocale,
  onGroup,
}: {
  page: CmsPage;
  project: Project;
  // False for a new page or unsaved edits: linking saves the whole project.
  saved: boolean;
  onLocale: (locale: string) => void;
  onGroup: (group: string | undefined) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [choice, setChoice] = useState<Record<string, string>>({});
  const languages = siteLanguages(project);
  const options = languages?.enabled.includes(page.locale)
    ? languages.enabled
    : [...(languages?.enabled || ["en", "ru", "de", "lv"]), page.locale];
  const active = project.pages.filter((p) => !p.deletedAt && p.id !== page.id);
  const members = page.translationGroup
    ? active.filter((p) => p.translationGroup === page.translationGroup)
    : [];
  async function commit(pages: CmsPage[], group: string | undefined) {
    setBusy(true);
    setNotice("");
    try {
      await saveProject({ ...project, pages });
      onGroup(group);
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const withGroup = (group: string | undefined, ids: string[]) =>
    project.pages.map((p) =>
      ids.includes(p.id) ? { ...p, translationGroup: group } : p,
    );
  async function link(locale: string) {
    const other = active.find((p) => p.id === choice[locale]);
    if (!other) return;
    const group =
      page.translationGroup || other.translationGroup || crypto.randomUUID();
    if (await commit(withGroup(group, [page.id, other.id]), group))
      setNotice(`Linked to ${other.title}.`);
  }
  async function create(locale: string) {
    const group = page.translationGroup || crypto.randomUUID();
    const taken = new Set(project.pages.map((p) => p.slug));
    let slug = `${page.slug}-${locale}`.slice(0, 120),
      n = 2;
    while (taken.has(slug)) slug = `${page.slug}-${locale}-${n++}`.slice(0, 120);
    const copy: CmsPage = {
      id: crypto.randomUUID(),
      title: `${page.title} (${locale.toUpperCase()})`.slice(0, 200),
      slug,
      locale,
      translationGroup: group,
      status: "Draft",
      clientAccess: page.clientAccess,
      sections: structuredClone(page.sections).map((section) => ({
        ...section,
        id: crypto.randomUUID(),
      })),
      seo: structuredClone(page.seo),
      updatedAt: "",
    };
    if (
      await commit([...withGroup(group, [page.id]), copy], group)
    )
      router.push(`/dashboard/pages/${slug}`);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="size-4" /> Language & translations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          aria-label="Page language"
          value={page.locale}
          onValueChange={onLocale}
        >
          {[...new Set(options)].map((code) => (
            <SelectOption key={code} value={code}>
              {LOCALE_NAMES[code] || code}
            </SelectOption>
          ))}
        </Select>
        {!languages ? (
          <p className="text-xs leading-5 text-neutral-500">
            Turn on a second language in Site layout → Languages to add
            translations of this page.
          </p>
        ) : (
          <div className="space-y-3">
            {languages.enabled
              .filter((code) => code !== page.locale)
              .map((code) => {
                const translation = members.find((p) => p.locale === code);
                const candidates = active.filter(
                  (p) =>
                    p.locale === code &&
                    (!p.translationGroup ||
                      active.filter(
                        (o) => o.translationGroup === p.translationGroup,
                      ).length === 1),
                );
                return (
                  <div
                    key={code}
                    className="space-y-2 rounded-lg bg-neutral-50 p-3"
                  >
                    <p className="text-xs font-medium">
                      {LOCALE_NAMES[code] || code}
                    </p>
                    {translation ? (
                      <Link
                        href={`/dashboard/pages/${translation.slug}`}
                        className="block text-sm underline underline-offset-4"
                      >
                        {translation.title}
                      </Link>
                    ) : (
                      <>
                        {!!candidates.length && (
                          <div className="flex gap-2">
                            <Select
                              aria-label={`Existing ${LOCALE_NAMES[code]} page`}
                              value={choice[code] || ""}
                              onValueChange={(id) =>
                                setChoice({ ...choice, [code]: id })
                              }
                            >
                              <SelectOption value="">Choose a page</SelectOption>
                              {candidates.map((p) => (
                                <SelectOption key={p.id} value={p.id}>
                                  {p.title}
                                </SelectOption>
                              ))}
                            </Select>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              aria-label={`Link ${LOCALE_NAMES[code]} page`}
                              disabled={busy || !saved || !choice[code]}
                              onClick={() => void link(code)}
                            >
                              <Link2 />
                            </Button>
                          </div>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full"
                          disabled={busy || !saved}
                          onClick={() => void create(code)}
                        >
                          <Plus />
                          Create {code.toUpperCase()} copy
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            {page.translationGroup && members.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy || !saved}
                onClick={async () => {
                  if (await commit(withGroup(undefined, [page.id]), undefined))
                    setNotice("This page is no longer linked to translations.");
                }}
              >
                <Unlink />
                Unlink this page
              </Button>
            )}
            {!saved && (
              <p className="text-xs text-neutral-500">
                Save the draft before linking or creating translations.
              </p>
            )}
            {notice && (
              <p role="status" className="text-xs">
                {notice}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
